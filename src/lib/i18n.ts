import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'i18n-settings' });
const LANGUAGE_KEY = 'app_language';

export type SupportedLanguage = 'en' | 'zh';

const resources = {
  en: {
    translation: {
      // Auth
      'auth.register': 'Register',
      'auth.login': 'Login',
      'auth.logout': 'Logout',
      'auth.email': 'Email',
      'auth.password': 'Password',
      'auth.name': 'Name',
      'auth.university': 'University',
      'auth.forgotPassword': 'Forgot Password?',
      'auth.emailInvalid': 'Please enter a valid email address',
      'auth.passwordTooShort': 'Password must be at least 8 characters',
      'auth.emailAlreadyUsed': 'This email is already in use',
      'auth.invalidCredentials': 'Incorrect email or password',
      'auth.fieldRequired': 'This field is required',
      // Tasks
      'task.title': 'Title',
      'task.course': 'Course',
      'task.dueDate': 'Due Date',
      'task.priority': 'Priority',
      'task.priority.high': 'High',
      'task.priority.medium': 'Medium',
      'task.priority.low': 'Low',
      'task.titleRequired': 'Task title cannot be empty',
      'task.dueDateInvalid': 'Due date cannot be earlier than today',
      'task.fileTooLarge': 'File size cannot exceed 20MB',
      // General
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.confirm': 'Confirm',
      'common.retry': 'Retry',
      'common.loading': 'Loading...',
      'common.offline': 'You are offline',
    },
  },
  zh: {
    translation: {
      // Auth
      'auth.register': '注册',
      'auth.login': '登录',
      'auth.logout': '退出登录',
      'auth.email': '邮箱',
      'auth.password': '密码',
      'auth.name': '姓名',
      'auth.university': '大学',
      'auth.forgotPassword': '忘记密码？',
      'auth.emailInvalid': '请输入有效的邮箱地址',
      'auth.passwordTooShort': '密码长度至少 8 个字符',
      'auth.emailAlreadyUsed': '该邮箱已被使用',
      'auth.invalidCredentials': '邮箱或密码错误',
      'auth.fieldRequired': '此字段为必填项',
      // Tasks
      'task.title': '标题',
      'task.course': '课程',
      'task.dueDate': '截止日期',
      'task.priority': '优先级',
      'task.priority.high': '高',
      'task.priority.medium': '中',
      'task.priority.low': '低',
      'task.titleRequired': '任务标题不能为空',
      'task.dueDateInvalid': '截止日期不能早于今天',
      'task.fileTooLarge': '文件大小不能超过 20MB',
      // General
      'common.save': '保存',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.confirm': '确认',
      'common.retry': '重试',
      'common.loading': '加载中...',
      'common.offline': '当前处于离线状态',
    },
  },
};

function getStoredLanguage(): SupportedLanguage | null {
  const value = storage.getString(LANGUAGE_KEY);
  if (value === 'en' || value === 'zh') return value;
  return null;
}

function getDeviceLanguage(): SupportedLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    const code = locale.split('-')[0].toLowerCase();
    return code === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function setLanguage(language: SupportedLanguage): void {
  storage.set(LANGUAGE_KEY, language);
  i18n.changeLanguage(language);
}

const initialLanguage = getStoredLanguage() ?? getDeviceLanguage();

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
