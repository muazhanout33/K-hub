const en = {
  items: {
    home: 'Home',
    courts: 'Courts',
    myBookings: 'My Bookings',
    sponsors: 'Sponsors',
    advertise: 'Advertise',
    aboutUs: 'About Us',
    contact: 'Contact',
    admin: 'Admin',
    events: 'Events',
    membership: 'Membership',
    bookCourt: 'Book Court',
    notifications: 'Notifications',
    profile: 'Profile',
  },
  brandTagline: 'Sports Club',
  brandLogoAlt: 'K-HUB Sports Club Logo',
  register: 'Register',
  signIn: 'Sign in',
  signOut: 'Sign Out',
  myProfile: 'My profile',
  navigationMenu: 'Navigation menu',
  localeSwitcherLabel: 'Language',
  themeLight: 'Light mode',
  themeDark: 'Dark mode',
};

export type NavDict = typeof en;

const ar: NavDict = {
  items: {
    home: 'الرئيسية',
    courts: 'الملاعب',
    myBookings: 'حجوزاتي',
    sponsors: 'الرعاة',
    advertise: 'أعلن معنا',
    aboutUs: 'من نحن',
    contact: 'اتصل بنا',
    admin: 'الإدارة',
    events: 'البطولات والفعاليات',
    membership: 'العضوية',
    bookCourt: 'احجز ملعب',
    notifications: 'الإشعارات',
    profile: 'الملف الشخصي',
  },
  brandTagline: 'نادي الرياضة',
  brandLogoAlt: 'شعار نادي كيه-هب للرياضة',
  register: 'تسجيل جديد',
  signIn: 'تسجيل الدخول',
  signOut: 'تسجيل الخروج',
  myProfile: 'ملفي الشخصي',
  navigationMenu: 'قائمة التنقل',
  localeSwitcherLabel: 'اللغة',
  themeLight: 'الوضع الفاتح',
  themeDark: 'الوضع الداكن',
};

export const nav = { en, ar };
