export const parseIdParam = (raw) => {
    if (typeof raw !== 'string'){
        return null;
    }
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)){
        return null;
    }
    const value = Number(trimmed);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
};
