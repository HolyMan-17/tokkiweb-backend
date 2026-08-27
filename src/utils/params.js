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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseUuidParam = (raw) => {
    if (typeof raw !== 'string'){
        return null;
    }
    const trimmed = raw.trim();
    return UUID_REGEX.test(trimmed) ? trimmed.toLowerCase() : null;
};
