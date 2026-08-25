import { describe, expect, test } from '@jest/globals';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import {
    uploadImage,
    isSupportedImageBuffer,
    translateUploadError,
    MAX_IMAGE_BYTES
} from '../src/middleware/upload.js';

const makeImage = async (format, width = 40) =>
    sharp({
        create: { width, height: width, channels: 3, background: { r: 10, g: 120, b: 200 } }
    })
        [format]()
        .toBuffer();

const buildMultipart = ({ fieldName = 'image', filename = 'test.png', contentType = 'image/png', fileBuffer }) => {
    const boundary = '----tokkitestboundary';
    const parts = [
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
        ),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ];
    const body = Buffer.concat(parts);
    return {
        body,
        headers: {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(body.length)
        }
    };
};

const buildTextFieldOnly = () => {
    const boundary = '----tokkitestboundary';
    const body = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\njust a field\r\n--${boundary}--\r\n`
    );
    return {
        body,
        headers: {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(body.length)
        }
    };
};

const makeRequest = ({ body, headers }) => Object.assign(Readable.from([body]), {
    headers,
    method: 'POST'
});

const runUpload = (req) => new Promise((resolve) => {
    const res = {
        statusCode: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({ nextCalled: false, statusCode: this.statusCode, body: payload });
        }
    };
    uploadImage(req, res, () => resolve({ nextCalled: true, req }));
});

describe('isSupportedImageBuffer (magic-byte sniffing)', () => {
    test('accepts real png bytes', async () => {
        await expect(isSupportedImageBuffer(await makeImage('png'))).resolves.toBe(true);
    });

    test('accepts real jpeg bytes', async () => {
        await expect(isSupportedImageBuffer(await makeImage('jpeg'))).resolves.toBe(true);
    });

    test('accepts real webp bytes', async () => {
        await expect(isSupportedImageBuffer(await makeImage('webp'))).resolves.toBe(true);
    });

    test('rejects plain text pretending to be anything', async () => {
        await expect(isSupportedImageBuffer(Buffer.from('<html>not an image</html>'))).resolves.toBe(false);
    });

    test('rejects empty buffers and non-buffer values', async () => {
        await expect(isSupportedImageBuffer(Buffer.alloc(0))).resolves.toBe(false);
        await expect(isSupportedImageBuffer(undefined)).resolves.toBe(false);
        await expect(isSupportedImageBuffer('products/x.webp')).resolves.toBe(false);
    });
});

describe('uploadImage middleware', () => {
    test('passes a valid png through to the next handler on req.file', async () => {
        const png = await makeImage('png');
        const result = await runUpload(makeRequest(buildMultipart({ fileBuffer: png })));

        expect(result.nextCalled).toBe(true);
        expect(result.req.file.buffer).toEqual(png);
        expect(result.req.file.size).toBe(png.length);
    });

    test('passes a valid webp declared as webp', async () => {
        const webp = await makeImage('webp');
        const result = await runUpload(makeRequest(buildMultipart({ contentType: 'image/webp', filename: 't.webp', fileBuffer: webp })));

        expect(result.nextCalled).toBe(true);
        expect(result.req.file.buffer).toEqual(webp);
    });

    test('rejects with 400 when no file part is present', async () => {
        const result = await runUpload(makeRequest(buildTextFieldOnly()));

        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        expect(result.body.message).toMatch(/no image/i);
    });

    test('rejects with 400 when the file arrives under an unexpected field name', async () => {
        const png = await makeImage('png');
        const result = await runUpload(makeRequest(buildMultipart({ fieldName: 'photo', fileBuffer: png })));

        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.body.message).toMatch(/field/i);
    });

    test('rejects with 400 when the file exceeds the size limit', async () => {
        const tooBig = Buffer.alloc(MAX_IMAGE_BYTES + 1024, 7);
        const result = await runUpload(makeRequest(buildMultipart({ fileBuffer: tooBig })));

        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.body.message).toMatch(/size limit/i);
    });

    test('rejects disallowed declared mimetypes before sniffing', async () => {
        const pdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
        const result = await runUpload(makeRequest(buildMultipart({ contentType: 'application/pdf', filename: 'doc.pdf', fileBuffer: pdfBytes })));

        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.body.message).toMatch(/unsupported image type/i);
    });

    test('rejects spoofed uploads whose bytes are not a supported image', async () => {
        const textBytes = Buffer.from('definitely not an image despite the header');
        const result = await runUpload(makeRequest(buildMultipart({ contentType: 'image/jpeg', filename: 'evil.jpg', fileBuffer: textBytes })));

        expect(result.nextCalled).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.body.message).toMatch(/supported image/i);
    });
});

describe('translateUploadError', () => {
    test('maps LIMIT_FILE_SIZE to a friendly message', () => {
        expect(translateUploadError({ code: 'LIMIT_FILE_SIZE' })).toMatch(/size limit/i);
    });

    test('maps LIMIT_UNEXPECTED_FILE and names the offending field', () => {
        const message = translateUploadError({ code: 'LIMIT_UNEXPECTED_FILE', field: 'avatar' });
        expect(message).toMatch(/field/i);
        expect(message).toContain('avatar');
    });

    test('falls back to the error message for unknown codes', () => {
        expect(translateUploadError({ code: 'LIMIT_WHATEVER', message: 'boom' })).toBe('boom');
    });
});
