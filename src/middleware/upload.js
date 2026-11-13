import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const ALLOWED_IMAGE_MIMES_LABEL = 'jpeg, png, webp';

const logRejectionToConsole = (details) => {
    console.error('[upload] rejected:', details);
};

export const isSupportedImageBuffer = async (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0){
        return false;
    }

    const type = await fileTypeFromBuffer(buffer);
    return Boolean(type && ALLOWED_IMAGE_MIMES.includes(type.mime));
};

export const translateUploadError = (err) => {
    switch (err.code){
        case 'LIMIT_FILE_SIZE':
            return 'Image exceeds the 5 MB size limit.';
        case 'LIMIT_UNEXPECTED_FILE':
            return `Unexpected upload field: ${err.field}. Use the "image" field.`;
        default:
            return err.message || 'Invalid upload.';
    }
};

export const createUploadImage = (logRejection = logRejectionToConsole) => {
    const uploadSingle = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
        fileFilter: (_req, file, cb) => {
            if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)){
                const err = new Error(`Unsupported image type. Allowed: ${ALLOWED_IMAGE_MIMES_LABEL}.`);
                err.code = 'UNSUPPORTED_IMAGE_TYPE';
                err.mimetype = file.mimetype;
                err.filename = file.originalname;
                cb(err);
                return;
            }
            cb(null, true);
        }
    }).single('image');

    return (req, res, next) => {
        uploadSingle(req, res, async (err) => {
            if (err){
                const reason = err.code === 'LIMIT_FILE_SIZE'
                    ? 'size_limit'
                    : err.code === 'LIMIT_UNEXPECTED_FILE'
                        ? 'unexpected_field'
                        : err.code === 'UNSUPPORTED_IMAGE_TYPE'
                            ? 'unsupported_type'
                            : 'multer_error';
                logRejection({
                    reason,
                    code: err.code,
                    field: err.field,
                    mimetype: err.mimetype,
                    filename: err.filename,
                    message: translateUploadError(err)
                });
                return res.status(400).json({ success: false, message: translateUploadError(err) });
            }

            if (!req.file){
                logRejection({ reason: 'no_file' });
                return res.status(400).json({ success: false, message: 'No image file was uploaded.' });
            }

            if (!(await isSupportedImageBuffer(req.file.buffer))){
                logRejection({
                    reason: 'unsupported_content',
                    mimetype: req.file.mimetype,
                    filename: req.file.originalname,
                    size: req.file.size,
                    message: `File content is not a supported image (${ALLOWED_IMAGE_MIMES_LABEL}).`
                });
                return res.status(400).json({
                    success: false,
                    message: `File content is not a supported image (${ALLOWED_IMAGE_MIMES_LABEL}).`
                });
            }

            next();
        });
    };
};

export const uploadImage = createUploadImage();
