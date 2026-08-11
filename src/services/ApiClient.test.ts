import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiRequestError } from './ApiClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchNoContent() {
  return Promise.resolve(new Response(null, { status: 204 }));
}

function mockFetchError(statusCode: number, message = 'Error', error?: string) {
  return Promise.resolve(
    new Response(JSON.stringify({ statusCode, message, error }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 构造函数和配置
// ===========================================================================

describe('构造函数和配置', () => {
  it('1. 使用默认配置创建实例', () => {
    const client = new ApiClient();
    // 实例创建后 tokens 应为 null
    expect(client.getTokens()).toBeNull();
  });

  it('2. 使用自定义配置创建实例', async () => {
    const client = new ApiClient({ baseUrl: 'https://custom.api.com/v2', timeout: 5000 });
    expect(client.getTokens()).toBeNull();
    // 验证自定义配置生效 —— 发一个请求检查 URL
    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ id: 1, username: 'u', email: 'e', role: 'r', display_name: 'd' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    client.setTokens({ accessToken: 'tok', refreshToken: 'ref' });
    // 通过 getProfile 触发 request 来间接验证 baseUrl
    await client.getProfile();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.api.com/v2/auth/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ===========================================================================
// Token 管理
// ===========================================================================

describe('Token 管理', () => {
  it('3. setTokens/getTokens 正常工作', () => {
    const client = new ApiClient();
    const tokens = { accessToken: 'access-123', refreshToken: 'refresh-456' };
    client.setTokens(tokens);
    expect(client.getTokens()).toEqual(tokens);
  });

  it('4. setTokens(null) 清除 tokens', () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(client.getTokens()).not.toBeNull();

    client.setTokens(null);
    expect(client.getTokens()).toBeNull();
  });
});

// ===========================================================================
// request() 方法
// ===========================================================================

describe('request() 方法', () => {
  it('5. 请求自动添加 Content-Type 和 Authorization header', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'my-token', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({
        id: 1,
        username: 'u',
        email: 'e',
        role: 'admin',
        display_name: 'd',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getProfile();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });

  it('6. 无 token 时不添加 Authorization header', async () => {
    const client = new ApiClient();
    // 不设置 token

    const fetchMock = vi
      .fn()
      .mockReturnValue(mockFetchResponse({ id: 1, username: 'u', role: 'user' }));
    vi.stubGlobal('fetch', fetchMock);

    await client.register('user', 'pass');

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('7. 非 2xx 响应抛出 ApiRequestError', async () => {
    const client = new ApiClient();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(mockFetchError(400, 'Bad Request', 'VALIDATION_ERROR')),
    );

    try {
      await client.getProfile();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.message).toBe('Bad Request');
      expect(apiErr.errorType).toBe('VALIDATION_ERROR');
    }
  });

  it('8. 204 响应返回 undefined', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(mockFetchNoContent()));

    // syncWorkouts 返回 WorkoutSyncResponse，但 204 时应该是 undefined
    const result = await client.syncWorkouts([]);
    expect(result).toBeUndefined();
  });

  it('9. 请求超时触发 AbortController', async () => {
    const client = new ApiClient({ timeout: 50 });
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      // 返回一个永不 resolve 的 Promise 来模拟挂起的请求
      return new Promise((_resolve, reject) => {
        // 监听 abort 事件来 reject
        capturedSignal!.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 发起请求
    const requestPromise = client.getProfile();

    // signal 应该被传递给 fetch
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);

    // 等待请求因 abort 而 reject
    await expect(requestPromise).rejects.toThrow();

    // abort 后 signal 应该变为 aborted
    expect(capturedSignal!.aborted).toBe(true);
  });
});

// ===========================================================================
// JWT 刷新
// ===========================================================================

describe('JWT 刷新', () => {
  it('10. 401 响应自动触发 token 刷新', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'old-access', refreshToken: 'valid-refresh' });

    const fetchMock = vi.fn()
      // 第一次调用 getProfile → 401
      .mockReturnValueOnce(mockFetchError(401, 'Unauthorized'))
      // 第二次调用 refresh → 成功
      .mockReturnValueOnce(
        mockFetchResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      // 第三次调用 getProfile 重试 → 成功
      .mockReturnValueOnce(
        mockFetchResponse({ id: 1, username: 'u', email: 'e', role: 'r', display_name: 'd' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.getProfile();
    expect(result).toEqual({ id: 1, username: 'u', email: 'e', role: 'r', display_name: 'd' });

    // 验证 refresh 被调用
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toBe('http://localhost:3000/api/auth/refresh');
  });

  it('11. 刷新成功后自动重试请求', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'old', refreshToken: 'refresh-tok' });

    const fetchMock = vi.fn()
      .mockReturnValueOnce(mockFetchError(401, 'Unauthorized'))
      .mockReturnValueOnce(
        mockFetchResponse({ accessToken: 'new-a', refreshToken: 'new-r' }),
      )
      .mockReturnValueOnce(
        mockFetchResponse({ id: 1, username: 'u', email: 'e', role: 'r', display_name: 'd' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client.getProfile();

    // 第三次调用应该是重试原始请求
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[0]).toBe('http://localhost:3000/api/auth/me');
    // 应该使用新的 token
    expect(retryCall[1].headers.Authorization).toBe('Bearer new-a');
  });

  it('12. 并发请求只触发一次刷新（refreshPromise 去重）', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'old', refreshToken: 'refresh-tok' });

    let refreshCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return mockFetchResponse({ accessToken: 'new-a', refreshToken: 'new-r' });
      }
      if (url.includes('/auth/me')) {
        // 所有请求都返回 401，触发刷新
        return mockFetchError(401, 'Unauthorized');
      }
      return mockFetchResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    // 并发发起 5 个请求
    const promises = Array.from({ length: 5 }, () => client.getProfile());
    await Promise.allSettled(promises);

    // refresh 只应被调用一次
    expect(refreshCallCount).toBe(1);
  });

  it('13. 刷新失败时清除 tokens 并返回 null', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'old', refreshToken: 'bad-refresh' });

    const fetchMock = vi.fn()
      // getProfile → 401
      .mockReturnValueOnce(mockFetchError(401, 'Unauthorized'))
      // refresh → 失败
      .mockReturnValueOnce(mockFetchError(403, 'Forbidden'));
    vi.stubGlobal('fetch', fetchMock);

    // 刷新失败后 request 会走到 !response.ok 分支抛出错误
    // 但实际上 refreshTokens 返回 null 后，request 不会重试，而是继续执行
    // 原始 401 响应会走到 !response.ok 抛出 ApiRequestError
    await expect(client.getProfile()).rejects.toThrow();

    // tokens 应被清除
    expect(client.getTokens()).toBeNull();
  });

  it('14. 无 refreshToken 时不尝试刷新', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'old', refreshToken: '' });

    const fetchMock = vi.fn()
      .mockReturnValue(mockFetchError(401, 'Unauthorized'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.getProfile()).rejects.toThrow();

    // fetch 只应被调用一次（原始请求），不应有 refresh 调用
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain('/auth/refresh');
  });
});

// ===========================================================================
// Auth 方法
// ===========================================================================

describe('Auth 方法', () => {
  it('15. login() 发送正确请求并存储 tokens', async () => {
    const client = new ApiClient();

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({
        accessToken: 'login-access',
        refreshToken: 'login-refresh',
        user: { id: 1, username: 'admin', role: 'admin' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.login('admin', 'password123');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      }),
    );
    expect(result.accessToken).toBe('login-access');
    expect(result.refreshToken).toBe('login-refresh');
    // tokens 应自动存储
    expect(client.getTokens()).toEqual({
      accessToken: 'login-access',
      refreshToken: 'login-refresh',
    });
  });

  it('16. register() 发送正确请求', async () => {
    const client = new ApiClient();

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ id: 2, username: 'newuser', role: 'user' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.register('newuser', 'pass', 'user', 'New User');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'newuser',
          password: 'pass',
          role: 'user',
          displayName: 'New User',
        }),
      }),
    );
    expect(result).toEqual({ id: 2, username: 'newuser', role: 'user' });
  });

  it('17. getProfile() 发送正确请求', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({
        id: 1,
        username: 'admin',
        email: 'a@b.com',
        role: 'admin',
        display_name: 'Admin',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.getProfile();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/me',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({
      id: 1,
      username: 'admin',
      email: 'a@b.com',
      role: 'admin',
      display_name: 'Admin',
    });
  });
});

// ===========================================================================
// Workout 方法
// ===========================================================================

describe('Workout 方法', () => {
  it('18. syncWorkouts() 发送 workouts 数组', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const workouts = [
      {
        id: 'w1',
        exerciseType: 'jump_rope' as const,
        mode: 'count' as const,
        count: 100,
        duration: 60,
        timestamp: Date.now(),
      },
    ];

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ synced: 1, lastSync: '2025-01-01T00:00:00Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.syncWorkouts(workouts);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/workouts/sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workouts }),
      }),
    );
  });

  it('19. pullWorkouts() 无参数请求', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ workouts: [], lastSync: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.pullWorkouts();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/workouts/sync',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('20. pullWorkouts(since) 带 since 参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ workouts: [], lastSync: '2025-06-01' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.pullWorkouts('2025-06-01T00:00:00Z');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/workouts/sync?since=2025-06-01T00%3A00%3A00Z',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('21. getWorkoutStats() 请求正确', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ totalWorkouts: 10, totalDuration: 300 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getWorkoutStats();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/workouts/stats',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ===========================================================================
// Pilot 方法
// ===========================================================================

describe('Pilot 方法', () => {
  it('22. listSchools() 请求正确', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse([{ id: 's1', name: 'School A' }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.listSchools();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/schools',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('23. listClassrooms() 无参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(mockFetchResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await client.listClassrooms();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/classrooms',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('24. listClassrooms(schoolId) 带参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(mockFetchResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await client.listClassrooms('school-123');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/classrooms?schoolId=school-123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('25. upsertClassroom() 发送正确 body', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ id: 'c1', schoolId: 's1', name: 'Class 1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = { schoolId: 's1', name: 'Class 1', grade: '5', teacherName: 'Mr. Li' };
    await client.upsertClassroom(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/classrooms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  });

  it('26. listStudents() 带 classId', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(mockFetchResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await client.listStudents('class-456');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/students?classId=class-456',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('27. upsertStudent() 发送正确 body', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ id: 'st1', name: 'Zhang San' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = {
      schoolId: 's1',
      classId: 'c1',
      name: 'Zhang San',
      studentNo: '001',
      gender: 'male',
    };
    await client.upsertStudent(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/students',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  });

  it('28. batchImportStudents() 发送正确 body', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ imported: 3, ids: ['id1', 'id2', 'id3'] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = {
      schoolId: 's1',
      classId: 'c1',
      students: [
        { name: 'Alice', studentNo: '001' },
        { name: 'Bob', studentNo: '002' },
        { name: 'Charlie', gender: 'male' },
      ],
    };
    await client.batchImportStudents(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/students/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  });

  it('29. listTasks() 带 classId', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(mockFetchResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await client.listTasks('class-789');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/tasks?classId=class-789',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('30. upsertTask() 发送正确 body', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ id: 't1', name: 'Jump Rope' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = {
      schoolId: 's1',
      classId: 'c1',
      name: 'Jump Rope',
      exerciseType: 'jump_rope',
      targetCount: 200,
      targetDurationSec: 60,
    };
    await client.upsertTask(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  });

  it('31. getTaskResults() 请求正确', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ taskId: 't1', results: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getTaskResults('task-abc');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/pilot/tasks/task-abc/results',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ===========================================================================
// Report 方法
// ===========================================================================

describe('Report 方法', () => {
  it('32. getClassSummary() 带参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ classId: 'c1', summary: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getClassSummary('c1', 'jump_rope');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/reports/class-summary');
    expect(calledUrl).toContain('classId=c1');
    expect(calledUrl).toContain('exerciseType=jump_rope');
  });

  it('33. getSchoolSummary() 带参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ schoolId: 's1', summary: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getSchoolSummary('s1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/reports/school-summary?schoolId=s1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('34. getStudentProgress() 带参数', async () => {
    const client = new ApiClient();
    client.setTokens({ accessToken: 'tok', refreshToken: 'r' });

    const fetchMock = vi.fn().mockReturnValue(
      mockFetchResponse({ studentId: 'st1', progress: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.getStudentProgress('st1', 'jump_rope');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/reports/student-progress');
    expect(calledUrl).toContain('studentId=st1');
    expect(calledUrl).toContain('exerciseType=jump_rope');
  });
});

// ===========================================================================
// ApiRequestError
// ===========================================================================

describe('ApiRequestError', () => {
  it('35. 正确设置 statusCode, message, errorType', () => {
    const err = new ApiRequestError(404, 'Not Found', 'NOT_FOUND');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.name).toBe('ApiRequestError');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.errorType).toBe('NOT_FOUND');
  });
});
