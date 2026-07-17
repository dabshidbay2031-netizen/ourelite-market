export type LangCode = 'en' | 'so' | 'ar';

/** All translatable strings. English is the source-of-truth key. */
export const translations: Record<LangCode, Record<string, string>> = {
  /* ── English (default) ──────────────────────────────────────────── */
  en: {
    // Nav
    explore:      'Explore',
    pos:          'Point of Sale',
    inventory:    'Inventory',
    suppliers:    'Suppliers',
    customers:    'Customers',
    dashboard:    'Dashboard',
    settings:     'Settings',
    profile:      'Profile',
    login:        'Login',
    orders:       'Orders',
    chat:         'Chat',
    alerts:       'Alerts',
    // Common actions
    add_to_cart:  'Add to Cart',
    buy_now:      'Buy Now',
    save:         'Save',
    cancel:       'Cancel',
    delete:       'Delete',
    edit:         'Edit',
    back:         'Back',
    close:        'Close',
    search:       'Search',
    loading:      'Loading…',
    confirm:      'Confirm',
    apply:        'Apply',
    remove:       'Remove',
    share:        'Share',
    copy_link:    'Copy Link',
    // Stock
    out_of_stock: 'Out of Stock',
    in_stock:     'In Stock',
    low_stock:    'Only {n} left',
    // Auth
    sign_in:      'Sign In',
    sign_out:     'Sign Out',
    sign_up:      'Create Account',
    welcome_back: 'Welcome back',
    no_account:   'New here?',
    have_account: 'Already have an account?',
    // Product
    reviews:          'Reviews',
    no_reviews:       'No reviews yet — be the first!',
    write_review:     'Write a Review',
    // Checkout
    order_summary:    'Order Summary',
    customer_info:    'Customer Info',
    payment_method:   'Payment Method',
    coupon_code:      'Coupon Code',
    delivery_address: 'Delivery Address',
    place_order:      'Place Order',
    payment_success:  'Payment Successful!',
    order_placed:     'Your order has been placed',
    continue_shop:    'Continue Shopping',
    view_order:       'Track Order',
    // Profile
    my_profile:   'My Profile',
    my_business:  'My Business',
    my_store:     'My Store',
    my_orders:    'My Orders',
    edit_profile: 'Edit Profile',
    save_profile: 'Save Profile',
    // Settings page
    store_name:   'Store Name',
    currency:     'Currency',
    language:     'Language',
    theme:        'Theme',
    dark_mode:    'Dark Mode',
    light_mode:   'Light Mode',
    // Referral
    refer_friend: 'Invite Friends',
    your_code:    'Your referral code',
    refer_desc:   'Share your code — both of you get $5 credit when they sign up',
    // Misc
    powered_by:   'Powered by Hamar Mall',
    all_products: 'All Products',
    best_sellers: 'Best Sellers',
    similar:      'Similar Products',
    add_first:    'Add your first',
    no_results:   'No results found',
  },

  /* ── Somali ─────────────────────────────────────────────────────── */
  so: {
    // Nav
    explore:      'Baadho',
    pos:          'Goobta Iibka',
    inventory:    'Kaydka',
    suppliers:    'Alaab Keenaha',
    customers:    'Macaamiisha',
    dashboard:    'Maamulka',
    settings:     'Goobaha',
    profile:      'Xogtayda',
    login:        'Gal',
    orders:       'Dalabyo',
    chat:         'Xiriir',
    alerts:       'Ogeysiisyo',
    // Common actions
    add_to_cart:  'Ku Dar',
    buy_now:      'Bixi Hadda',
    save:         'Kaydso',
    cancel:       'Jooji',
    delete:       'Tirtir',
    edit:         'Wax ka Beddel',
    back:         'Dib u Noqo',
    close:        'Xidh',
    search:       'Raadi',
    loading:      'Sug…',
    confirm:      'Xaqiiji',
    apply:        'Codso',
    remove:       'Ka Saar',
    share:        'La Wadaag',
    copy_link:    'Kobi Xiriirka',
    // Stock
    out_of_stock: 'Ma Jiro',
    in_stock:     'La Heli Karo',
    low_stock:    '{n} ayaa haray',
    // Auth
    sign_in:      'Gal',
    sign_out:     'Ka Bax',
    sign_up:      'Abuur Xisaab',
    welcome_back: 'Soo Dhawoow',
    no_account:   'Xisaab ma lihid?',
    have_account: 'Horey xisaab u leedahay?',
    // Product
    reviews:          'Dib u Eegidda',
    no_reviews:       'Dib u eegid ma jirto — adiga kii ugu horeysaa noqo!',
    write_review:     'Qor Dib u Eegid',
    // Checkout
    order_summary:    'Soo Koobid Dalabka',
    customer_info:    'Macluumaadka Macmiilka',
    payment_method:   'Qaabka Lacag Bixinta',
    coupon_code:      'Koodhka Kuubnka',
    delivery_address: 'Cinwaanka Gaarsiinta',
    place_order:      'Dalbo',
    payment_success:  'Lacag Bixintu Guuleysatay!',
    order_placed:     'Dalabaadkaagu waa la gaarsiin doonaa',
    continue_shop:    'Sii Wad Iibashada',
    view_order:       'Raac Dalabka',
    // Profile
    my_profile:   'Xogtayda',
    my_business:  'Ganacsigayga',
    my_store:     'Dukaankayga',
    my_orders:    'Dalabaadkayga',
    edit_profile: 'Wax ka Beddel Xogta',
    save_profile:  'Kaydi Xogta',
    // Settings
    store_name:   'Magaca Dukaanka',
    currency:     'Lacagta',
    language:     'Luqadda',
    theme:        'Muuqaalka',
    dark_mode:    'Mugdi',
    light_mode:   'Iftiinka',
    // Referral
    refer_friend: 'Ku Casuumid Saaxiibada',
    your_code:    'Koodhaaga tilmaamaha',
    refer_desc:   'La wadaag koodhaaga — labadiin waxaad heshaan $5 aad isku adeegsateen',
    // Misc
    powered_by:   'Waxay shaqaysaa Hamar Mall',
    all_products: 'Dhammaan Alaabta',
    best_sellers: 'Ugu Badan Iibka',
    similar:      'Alaab La Mid Ah',
    add_first:    'Kudar kuwii ugu horreeya',
    no_results:   'Wax la helay ma jiro',
  },

  /* ── Arabic (العربية) ───────────────────────────────────────────── */
  ar: {
    // Nav
    explore:      'استكشف',
    pos:          'نقطة البيع',
    inventory:    'المخزون',
    suppliers:    'الموردون',
    customers:    'العملاء',
    dashboard:    'لوحة التحكم',
    settings:     'الإعدادات',
    profile:      'ملفي',
    login:        'دخول',
    orders:       'الطلبات',
    chat:         'الدردشة',
    alerts:       'التنبيهات',
    // Common actions
    add_to_cart:  'أضف للسلة',
    buy_now:      'اشتري الآن',
    save:         'حفظ',
    cancel:       'إلغاء',
    delete:       'حذف',
    edit:         'تعديل',
    back:         'رجوع',
    close:        'إغلاق',
    search:       'بحث',
    loading:      'جارٍ التحميل…',
    confirm:      'تأكيد',
    apply:        'تطبيق',
    remove:       'إزالة',
    share:        'مشاركة',
    copy_link:    'نسخ الرابط',
    // Stock
    out_of_stock: 'غير متوفر',
    in_stock:     'متوفر',
    low_stock:    'تبقى {n} فقط',
    // Auth
    sign_in:      'تسجيل الدخول',
    sign_out:     'تسجيل الخروج',
    sign_up:      'إنشاء حساب',
    welcome_back: 'مرحباً بعودتك',
    no_account:   'مستخدم جديد؟',
    have_account: 'لديك حساب بالفعل؟',
    // Product
    reviews:          'التقييمات',
    no_reviews:       'لا توجد تقييمات حتى الآن — كن أول مقيّم!',
    write_review:     'اكتب تقييماً',
    // Checkout
    order_summary:    'ملخص الطلب',
    customer_info:    'بيانات العميل',
    payment_method:   'طريقة الدفع',
    coupon_code:      'كود الخصم',
    delivery_address: 'عنوان التوصيل',
    place_order:      'تأكيد الطلب',
    payment_success:  'تم الدفع بنجاح!',
    order_placed:     'تم تقديم طلبك',
    continue_shop:    'مواصلة التسوق',
    view_order:       'تتبع الطلب',
    // Profile
    my_profile:   'ملفي الشخصي',
    my_business:  'أعمالي',
    my_store:     'متجري',
    my_orders:    'طلباتي',
    edit_profile: 'تعديل الملف',
    save_profile: 'حفظ الملف',
    // Settings
    store_name:   'اسم المتجر',
    currency:     'العملة',
    language:     'اللغة',
    theme:        'المظهر',
    dark_mode:    'الوضع الليلي',
    light_mode:   'الوضع النهاري',
    // Referral
    refer_friend: 'دعوة الأصدقاء',
    your_code:    'كود الإحالة الخاص بك',
    refer_desc:   'شارك كودك — كلاكما يحصل على $5 عند التسجيل',
    // Misc
    powered_by:   'مدعوم من Hamar Mall',
    all_products: 'جميع المنتجات',
    best_sellers: 'الأكثر مبيعاً',
    similar:      'منتجات مشابهة',
    add_first:    'أضف أول',
    no_results:   'لا توجد نتائج',
  },
};

/** Returns direction for a language ('rtl' for Arabic, 'ltr' for all others) */
export function getDir(lang: LangCode): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** Maps settings language string to LangCode */
export function toLangCode(lang: string): LangCode {
  if (lang === 'Somali')  return 'so';
  if (lang === 'Arabic')  return 'ar';
  return 'en';
}
