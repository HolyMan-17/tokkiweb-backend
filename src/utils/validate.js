export const normalizeAndValidatePhone = (country_code, tlf_num) => {
    const stripFormatting = (str) => str.replace(/[\s\-().]/g, '');

    if (typeof tlf_num !== 'string') return null;

    let cleaned = stripFormatting(tlf_num.trim());

    if (cleaned.startsWith('+')){
        return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
    }

    if (typeof country_code !== 'string') return null;

    const code = stripFormatting(country_code.trim());
    if (!/^\+\d{1,3}$/.test(code)) return null;
    if (!/^\d{7,15}$/.test(cleaned)) return null;

    cleaned = cleaned.replace(/^0/, '');

    const full = code + cleaned;
    return /^\+[1-9]\d{7,14}$/.test(full) ? full : null;
};

export const normalizeAndValidateCedula = (raw) => {
    if (typeof raw !== 'string') return null;

    const cleaned = raw.trim().replace(/\s+/g, '').toUpperCase();

    const match = cleaned.match(/^([VE])-?(\d{6,8})$/);
    return match ? `${match[1]}-${match[2]}` : null;
};
