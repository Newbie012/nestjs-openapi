import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

/**
 * @typedef {Object} OgFont
 * @property {string} name
 * @property {ArrayBuffer} data
 * @property {400 | 600 | 700} weight
 * @property {'normal'} style
 */

const fontPath = (fileName) => join(process.cwd(), 'public', 'fonts', fileName);

// Load Inter font from local assets (WOFF format - Satori doesn't support WOFF2)
/**
 * @returns {Promise<OgFont[]>}
 */
export const loadInterFont = async () => {
  try {
    const [interRegular, interSemiBold, interBold] = await Promise.all([
      readFile(fontPath('Inter-Regular.woff')),
      readFile(fontPath('Inter-SemiBold.woff')),
      readFile(fontPath('Inter-Bold.woff')),
    ]);

    return [
      {
        name: 'Inter',
        data: interRegular.buffer.slice(
          interRegular.byteOffset,
          interRegular.byteOffset + interRegular.byteLength,
        ),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: interSemiBold.buffer.slice(
          interSemiBold.byteOffset,
          interSemiBold.byteOffset + interSemiBold.byteLength,
        ),
        weight: 600,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: interBold.buffer.slice(
          interBold.byteOffset,
          interBold.byteOffset + interBold.byteLength,
        ),
        weight: 700,
        style: 'normal',
      },
    ];
  } catch {
    return [];
  }
};
