import { Fragment, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateNotification from './components/UpdateNotification';
import HomePage from './pages/HomePage';

const WorkoutPage = lazy(() => import('./pages/WorkoutPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const TeacherPage = lazy(() => import('./pages/TeacherPage'));
const pageFallback = <div className="page">加载中...</div>;

export default function App() {
  return (
    <Fragment>
      <ErrorBoundary>
        <HashRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/workout/:exerciseType"
              element={
                <Suspense fallback={pageFallback}>
                  <WorkoutPage />
                </Suspense>
              }
            />
            <Route
              path="/history"
              element={
                <Suspense fallback={pageFallback}>
                  <HistoryPage />
                </Suspense>
              }
            />
            <Route
              path="/analytics"
              element={
                <Suspense fallback={pageFallback}>
                  <AnalyticsPage />
                </Suspense>
              }
            />
            <Route
              path="/teacher"
              element={
                <Suspense fallback={pageFallback}>
                  <TeacherPage />
                </Suspense>
              }
            />
            {/* 404 兜底：未匹配的路由重定向到首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
      <UpdateNotification />
    </Fragment>
  );
}
