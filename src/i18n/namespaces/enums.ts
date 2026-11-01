const en = {
  sport: {
    Football: 'Football',
    Tennis: 'Tennis',
    Padel: 'Padel',
  },
  courtStatus: {
    Available: 'Available',
    'Booked': 'Booked',
    'Starts Soon': 'Starts Soon',
    Maintenance: 'Maintenance',
  },
  slotStatus: {
    Available: 'Available',
    Booked: 'Booked',
    Reserved: 'Reserved',
    Blocked: 'Blocked',
    Past: 'Past',
  },
  bookingStatus: {
    Reserved: 'Reserved',
    Confirmed: 'Confirmed',
    Expired: 'Expired',
    Cancelled: 'Cancelled',
  },
  paymentStatus: {
    Pending: 'Pending',
    Paid: 'Paid',
    Failed: 'Failed',
    Cancelled: 'Cancelled',
    Refunded: 'Refunded',
  },
  bookingSource: {
    ONLINE: 'Online',
    WALK_IN: 'Walk-in',
    ADMIN: 'Admin',
  },
  sponsorshipStatus: {
    Pending: 'Pending',
    Approved: 'Approved',
    Rejected: 'Rejected',
    Cancelled: 'Cancelled',
  },
  advertisementStatus: {
    Pending: 'Pending',
    Approved: 'Approved',
    Rejected: 'Rejected',
    Cancelled: 'Cancelled',
  },
  faqCategory: {
    General: 'General',
    Booking: 'Booking',
    Membership: 'Membership',
    Cancellation: 'Cancellation',
  },
  userRole: {
    Guest: 'Guest',
    User: 'User',
    Admin: 'Admin',
  },
  billingPeriod: {
    Month: 'Month',
    Season: 'Season',
    Year: 'Year',
  },
  sponsorshipTarget: {
    Club: 'Club',
    Court: 'Court',
    FacilityArea: 'Facility Area',
  },
  sponsorshipPricing: {
    OneTime: 'One Time',
    PerMonth: 'Per Month',
    PerSeason: 'Per Season',
  },
};

export type EnumsDict = typeof en;

const ar: EnumsDict = {
  sport: {
    Football: 'كرة قدم',
    Tennis: 'تنس',
    Padel: 'بادل',
  },
  courtStatus: {
    Available: 'متاح',
    Booked: 'محجوز',
    'Starts Soon': 'يبدأ قريبًا',
    Maintenance: 'صيانة',
  },
  slotStatus: {
    Available: 'متاح',
    Booked: 'محجوز',
    Reserved: 'محجوز مبدئيًا',
    Blocked: 'مغلق',
    Past: 'انقضى',
  },
  bookingStatus: {
    Reserved: 'محجوز مبدئيًا',
    Confirmed: 'مؤكد',
    Expired: 'منتهي',
    Cancelled: 'ملغي',
  },
  paymentStatus: {
    Pending: 'قيد الانتظار',
    Paid: 'مدفوع',
    Failed: 'فشل',
    Cancelled: 'ملغي',
    Refunded: 'مسترد',
  },
  bookingSource: {
    ONLINE: 'عبر الإنترنت',
    WALK_IN: 'بالحضور',
    ADMIN: 'الإدارة',
  },
  sponsorshipStatus: {
    Pending: 'قيد المراجعة',
    Approved: 'مقبول',
    Rejected: 'مرفوض',
    Cancelled: 'ملغي',
  },
  advertisementStatus: {
    Pending: 'قيد المراجعة',
    Approved: 'مقبول',
    Rejected: 'مرفوض',
    Cancelled: 'ملغي',
  },
  faqCategory: {
    General: 'عام',
    Booking: 'الحجز',
    Membership: 'العضوية',
    Cancellation: 'الإلغاء',
  },
  userRole: {
    Guest: 'زائر',
    User: 'مستخدم',
    Admin: 'مدير',
  },
  billingPeriod: {
    Month: 'شهر',
    Season: 'موسم',
    Year: 'سنة',
  },
  sponsorshipTarget: {
    Club: 'النادي',
    Court: 'ملعب',
    FacilityArea: 'منطقة مرافق',
  },
  sponsorshipPricing: {
    OneTime: 'دفعة واحدة',
    PerMonth: 'شهريًا',
    PerSeason: 'موسميًا',
  },
};

export const enums = { en, ar };
