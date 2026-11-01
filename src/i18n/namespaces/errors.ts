/**
 * Centralized error / validation messages coming from services, stores and
 * server actions. Keys are camelCase; the English string doubles as the
 * lookup key in `errorMessageKey()` reverse map (see src/i18n/errors.ts).
 */
const en = {
  allFieldsRequired: 'All fields are required.',
  passwordMinLength: 'Password must be at least 6 characters.',
  loginFailed: 'Login failed. Please try again.',
  invalidCredentials: 'Invalid email or password.',
  emailInvalid: 'Please enter a valid email address.',
  emailExists: 'An account with this email already exists.',
  somethingWentWrong: 'Something went wrong. Please try again.',
  networkError: 'Network error. Please check your connection and try again.',
  noCourtSelected: 'No court selected. Please select a court first.',
  bookingDetailsRequired: 'Please fill in your name and email before confirming.',
  cancellationInProgress: 'Cancellation already in progress.',
  sessionExpired: 'Your session has expired. Please sign in again.',
};

export type ErrorsDict = typeof en;

const ar: ErrorsDict = {
  allFieldsRequired: 'جميع الحقول مطلوبة.',
  passwordMinLength: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
  loginFailed: 'فشل تسجيل الدخول. حاول مرة أخرى.',
  invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  emailInvalid: 'يرجى إدخال بريد إلكتروني صحيح.',
  emailExists: 'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل.',
  somethingWentWrong: 'حدث خطأ ما. حاول مرة أخرى.',
  networkError: 'خطأ في الشبكة. تحقق من اتصالك وحاول مرة أخرى.',
  noCourtSelected: 'لم يتم اختيار ملعب. يرجى اختيار ملعب أولًا.',
  bookingDetailsRequired: 'يرجى إدخال اسمك وبريدك الإلكتروني قبل التأكيد.',
  cancellationInProgress: 'عملية إلغاء جارية بالفعل.',
  sessionExpired: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.',
};

export const errors = { en, ar };
