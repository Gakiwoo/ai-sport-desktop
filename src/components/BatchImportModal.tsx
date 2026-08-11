import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/ApiClient';
import PilotService from '../services/PilotService';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  classId: string;
  onImportComplete?: (count: number) => void;
}

interface ParsedStudent {
  name: string;
  studentNo?: string;
  gender?: string;
}

interface CloudStudent {
  id: string;
  name: string;
  studentNo?: string;
  gender?: string;
  selected: boolean;
}

type TabKey = 'file' | 'cloud';

const HEADER_ALIASES: Record<string, keyof ParsedStudent> = {
  '姓名': 'name',
  'name': 'name',
  '学生姓名': 'name',
  '学号': 'studentNo',
  'studentno': 'studentNo',
  'student_no': 'studentNo',
  '编号': 'studentNo',
  '性别': 'gender',
  'gender': 'gender',
  'sex': 'gender',
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectColumnMapping(headers: string[]): Record<keyof ParsedStudent, number> {
  const mapping: Record<keyof ParsedStudent, number> = { name: -1, studentNo: -1, gender: -1 };
  headers.forEach((header, index) => {
    const normalized = header.trim().toLowerCase().replace(/[\s_-]/g, '');
    const key = HEADER_ALIASES[header.trim()] ?? HEADER_ALIASES[normalized];
    if (key && mapping[key] === -1) {
      mapping[key] = index;
    }
  });
  return mapping;
}

function parseCsvContent(text: string): ParsedStudent[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const mapping = detectColumnMapping(headers);

  if (mapping.name === -1) {
    // Fallback: assume first column is name, second is studentNo, third is gender
    mapping.name = 0;
    if (headers.length > 1) mapping.studentNo = 1;
    if (headers.length > 2) mapping.gender = 2;
  }

  const students: ParsedStudent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = mapping.name >= 0 ? cells[mapping.name]?.trim() : '';
    if (!name) continue;
    students.push({
      name,
      studentNo: mapping.studentNo >= 0 ? cells[mapping.studentNo]?.trim() || undefined : undefined,
      gender: mapping.gender >= 0 ? cells[mapping.gender]?.trim() || undefined : undefined,
    });
  }
  return students;
}

export default function BatchImportModal({
  isOpen,
  onClose,
  schoolId,
  classId,
  onImportComplete,
}: BatchImportModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('file');
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [cloudStudents, setCloudStudents] = useState<CloudStudent[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setParsedStudents([]);
      setFileName('');
      setMessage('');
      setCloudStudents([]);
      setActiveTab('file');
    }
  }, [isOpen]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage(text);
    setMessageType(type);
  };

  const handleFile = useCallback(async (file: File) => {
    setMessage('');
    setFileName(file.name);

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      showMessage('暂不支持直接解析 Excel 文件，请导出为 CSV 格式后重试', 'error');
      return;
    }

    try {
      const text = await file.text();
      const students = parseCsvContent(text);
      if (students.length === 0) {
        showMessage('未能从文件中解析到学生数据，请检查 CSV 格式（需包含姓名列）', 'error');
        return;
      }
      setParsedStudents(students);
      showMessage(`已解析 ${students.length} 名学生`, 'success');
    } catch {
      showMessage('文件读取失败', 'error');
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) handleFile(file);
  };

  const importFromFile = async () => {
    if (parsedStudents.length === 0) return;
    setImporting(true);
    setMessage('');
    try {
      // Try cloud batch import first if connected
      if (apiClient.getTokens()) {
        const result = await apiClient.batchImportStudents({
          schoolId,
          classId,
          students: parsedStudents,
        });
        showMessage(`云端导入成功：${result.imported} 名学生`, 'success');
        onImportComplete?.(result.imported);
      } else {
        // Local import via PilotService
        let count = 0;
        for (const student of parsedStudents) {
          PilotService.upsertStudent(PilotService.load(), {
            classId,
            name: student.name,
            studentNo: student.studentNo,
          });
          count++;
        }
        showMessage(`本地导入成功：${count} 名学生`, 'success');
        onImportComplete?.(count);
      }
      setParsedStudents([]);
      setFileName('');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const fetchCloudStudents = async () => {
    setCloudLoading(true);
    setMessage('');
    try {
      const students = await apiClient.listStudents(classId || undefined);
      setCloudStudents(
        students.map((s) => ({
          id: String(s.id ?? ''),
          name: String(s.name ?? ''),
          studentNo: s.studentNo ? String(s.studentNo) : undefined,
          gender: s.gender ? String(s.gender) : undefined,
          selected: true,
        })),
      );
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '获取云端学生失败', 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  const toggleCloudStudent = (id: string) => {
    setCloudStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)),
    );
  };

  const toggleAllCloud = (selected: boolean) => {
    setCloudStudents((prev) => prev.map((s) => ({ ...s, selected })));
  };

  const importFromCloud = async () => {
    const selected = cloudStudents.filter((s) => s.selected);
    if (selected.length === 0) return;
    setImporting(true);
    setMessage('');
    try {
      let count = 0;
      for (const student of selected) {
        PilotService.upsertStudent(PilotService.load(), {
          classId,
          name: student.name,
          studentNo: student.studentNo,
        });
        count++;
      }
      showMessage(`已从云端导入 ${count} 名学生到本地`, 'success');
      onImportComplete?.(count);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="batch-modal-overlay" onClick={onClose}>
      <div className="batch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="batch-modal-header">
          <h2>批量导入学生</h2>
          <button type="button" className="batch-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="batch-modal-tabs">
          <button
            type="button"
            className={`batch-modal-tab ${activeTab === 'file' ? 'batch-modal-tab--active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            文件导入
          </button>
          <button
            type="button"
            className={`batch-modal-tab ${activeTab === 'cloud' ? 'batch-modal-tab--active' : ''}`}
            onClick={() => setActiveTab('cloud')}
          >
            云端导入
          </button>
        </div>

        <div className="batch-modal-body">
          {activeTab === 'file' && (
            <div className="batch-file-tab">
              <div
                className={`batch-drop-zone ${dragOver ? 'batch-drop-zone--active' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
                <p className="batch-drop-text">
                  {fileName ? fileName : '拖拽 CSV 文件到此处，或点击选择文件'}
                </p>
                <p className="batch-drop-hint">支持 CSV 格式（含姓名/学号/性别列）</p>
              </div>

              {parsedStudents.length > 0 && (
                <div className="batch-preview">
                  <table className="batch-preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>姓名</th>
                        <th>学号</th>
                        <th>性别</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedStudents.slice(0, 50).map((student, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{student.name}</td>
                          <td>{student.studentNo || '-'}</td>
                          <td>{student.gender || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedStudents.length > 50 && (
                    <p className="batch-preview-more">
                      ...还有 {parsedStudents.length - 50} 条
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                className="batch-import-btn"
                onClick={importFromFile}
                disabled={parsedStudents.length === 0 || importing}
              >
                {importing ? '导入中...' : `导入 ${parsedStudents.length} 名学生`}
              </button>
            </div>
          )}

          {activeTab === 'cloud' && (
            <div className="batch-cloud-tab">
              <div className="batch-cloud-actions">
                <button
                  type="button"
                  className="batch-import-btn batch-import-btn--secondary"
                  onClick={fetchCloudStudents}
                  disabled={cloudLoading}
                >
                  {cloudLoading ? '加载中...' : '获取云端学生'}
                </button>
                {cloudStudents.length > 0 && (
                  <>
                    <button type="button" className="batch-link-btn" onClick={() => toggleAllCloud(true)}>
                      全选
                    </button>
                    <button type="button" className="batch-link-btn" onClick={() => toggleAllCloud(false)}>
                      取消全选
                    </button>
                  </>
                )}
              </div>

              {cloudStudents.length > 0 && (
                <div className="batch-cloud-list">
                  {cloudStudents.map((student) => (
                    <label key={student.id} className="batch-cloud-item">
                      <input
                        type="checkbox"
                        checked={student.selected}
                        onChange={() => toggleCloudStudent(student.id)}
                      />
                      <span>{student.name}</span>
                      {student.studentNo && <small>{student.studentNo}</small>}
                    </label>
                  ))}
                </div>
              )}

              {cloudStudents.length > 0 && (
                <button
                  type="button"
                  className="batch-import-btn"
                  onClick={importFromCloud}
                  disabled={cloudStudents.filter((s) => s.selected).length === 0 || importing}
                >
                  {importing ? '导入中...' : `导入选中 (${cloudStudents.filter((s) => s.selected).length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {message && (
          <p className={`batch-modal-message batch-modal-message--${messageType}`}>{message}</p>
        )}
      </div>
    </div>
  );
}
