// Builds cutouts/<image_id>.webp and data/cutouts.js: figures cut out of the artworks in art/ for Collage and Fridge.
// The cutting is done by a local background-removal model; only the clean, recognisable results are kept (KEEP below,
// chosen by eye from a contact sheet). The images are CC0 (Art Institute of Chicago), so the cutouts are too.
// Usage: npm install --no-save @imgly/background-removal-node@1.4.5 sharp@0.33.5   (then delete node_modules after)
//        node tools/build-cutouts.mjs
// To add more: run with --all to cut every artwork into cutouts-review/, look through them, add the good ones to KEEP.
import fs from 'node:fs';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';

const KEEP = {
  "0729fbba-51e3-a2d7-6d4d-61c2be62af3f": "magnolias",
  "108f44fc-d93b-abf0-c33c-2920d57844c3": "a young man praying",
  "10bdba64-db41-0811-f681-c904afded43c": "a gentleman in a red coat",
  "154292ca-b195-89b4-21f2-3d817307dc24": "a figure in a patterned robe",
  "1c2d32a7-790c-501a-e124-00f28cf5052d": "a woman leaning on her elbow",
  "1cddae1c-99d5-462f-4aa6-128c0732ac11": "a teapot and fruit",
  "22794b3c-eabf-24ce-26fc-d37be1d66cec": "an old man tipping his hat",
  "25f660ee-f1db-d13b-42a5-56df97c98ba7": "a diamond of colour",
  "2d484387-2509-5e8e-2c43-22f9981972eb": "a woman with a parasol",
  "2e6d08c8-dac0-4f1c-3e56-de3539ceb905": "a woman in a lace collar",
  "2fa24f36-cc26-41b6-4b49-12bba2a6c1c8": "a great wave",
  "33fc29fc-097b-576b-c9e6-c3352d9d3f15": "a palm tree",
  "3a608f55-d76e-fa96-d0b1-0789fbc48f1e": "two girls in hats",
  "3b885ae0-4d46-5fe4-d70a-00474827f02c": "a mother and child",
  "3eaab3a3-2b47-9fdd-121c-050f6b8d9ccb": "a man in a feathered hat",
  "40fdb1d6-93fe-2916-78fb-f56a1ac261f1": "two figures in robes",
  "43165650-0212-8897-0605-dc3fdda88c13": "a man in black",
  "47c5bcb8-62ef-e5d7-55e7-f5121f409a30": "a painter with a red beard",
  "4822cd01-44ac-041a-36b8-c0542377b750": "a woman in red",
  "48268fc7-2eb4-ded6-1293-e91f27b66478": "a woman with a fan",
  "48b2de88-ba73-8e19-f448-d1cef4a1c847": "a woman with a sickle",
  "52ac8996-3460-cf71-cb42-5c4d0aa29b74": "a basket of fruit",
  "5490fd49-dd52-4fd7-7d41-d871dcffae55": "a man in a red tunic",
  "5b805de8-cb66-b522-6a62-88742994c65c": "a man with a book",
  "5de78980-17d7-8fb5-83de-7b2ae4e997f2": "cows",
  "622998f1-73f9-4c96-08cf-60bda7c9ce4b": "two fencers",
  "6644829f-f292-c5c4-a73c-0356a6fdbf0d": "a yellow chair and a bed",
  "72227c9e-413c-8930-477d-5a90e0a2123c": "a woman in white",
  "77951d0c-d781-eac6-f4ff-f13cc5cfc0cf": "an angel and a girl in blue",
  "7b7a6f39-1cd8-ea2f-9811-18b0e23edac0": "a painter with a palette",
  "7e649536-b186-c3f5-3e6d-0d22d5d798ef": "a man and a woman",
  "82a87cf0-6082-a7f7-c2cf-0fc9283ed966": "men around a table",
  "83802ee1-1682-6de0-7276-37c4ab3fa879": "a mother and daughter",
  "8cb9f5ea-c955-96fd-c2d6-c720b0dbf7d4": "a woman in black",
  "8d119fd0-2f57-f20e-a3f5-a573904001e9": "an officer",
  "8eccb189-92f3-353a-3337-c0778c2680d9": "dancers",
  "92777387-4f55-e3fa-10ba-a549810aca95": "a woman in green",
  "95be2572-b53d-8e7b-abc9-10eb48d4fa5d": "a little boat",
  "9b1c3d61-5f9b-c7a2-a5ea-f48248836160": "an old man in red",
  "a34d9d72-c4ec-0750-389e-a01215c9aab0": "a horse and a cow",
  "ae0793ac-8ace-6c4a-84d4-a33162ae6832": "riders on horseback",
  "b146368d-a855-63ac-6115-04b835c60bb0": "a couple at a café table",
  "ba4d7ead-bd10-e02d-6f5f-613050d7062e": "a pair in black",
  "bc24fe7f-4171-c785-bff2-b2ed3777a47d": "a man in a cape",
  "c95d58bf-fe9e-e5bb-2c71-ab8bad984759": "a man in a black hat",
  "cd2ebc0d-eea7-d476-1a57-daf8a3976675": "a group singing",
  "d0e36029-27fc-bf4e-357a-55cfbaf7bdfd": "a woman with a goldfish bowl",
  "d63b9402-c42b-cce3-aa63-6d213ad621cd": "a mother and baby",
  "ded2fc0d-564a-670a-178e-5acc0af5d823": "a bull",
  "e54a695c-16df-cf45-9dd4-b517e8c32cc3": "a boy on a donkey",
  "f1e03813-f9c7-f4f8-fbe8-a5eeae84fda4": "a rider on a red horse",
  "f2021182-1302-f76f-97f1-4e7850030e3b": "fruit and a cabbage",
  "f7b2db45-f393-653c-07ef-84319b0cdb92": "ladies in big skirts",
  "f8fd76e9-c396-5678-36ed-6a348c904d27": "a couple in top hat and bonnet",
  "fd991fea-0c13-8444-7879-aba467f1d9db": "a woman in a black hat",
};

const all = process.argv.includes('--all');
const ids = all ? fs.readdirSync('art').filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)) : Object.keys(KEEP);
const outDir = all ? 'cutouts-review' : 'cutouts';
fs.mkdirSync(outDir, { recursive: true });
const list = [];
for (const id of ids) {
  const blob = await removeBackground('file://' + process.cwd().replace(/\\/g, '/') + '/art/' + id + '.jpg', { model: 'medium', output: { format: 'image/png' } });
  const png = Buffer.from(await blob.arrayBuffer());
  // Crop to the subject (alpha above 40), then shrink to fit 400px.
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) continue;
  const left = Math.max(0, x0 - 2), top = Math.max(0, y0 - 2);
  const buf = await sharp(png).extract({ left, top, width: Math.min(info.width, x1 + 3) - left, height: Math.min(info.height, y1 + 3) - top })
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
  fs.writeFileSync(`${outDir}/${id}.webp`, buf);
  const m = await sharp(buf).metadata();
  list.push({ i: id, n: KEEP[id] || '', w: m.width, h: m.height });
  console.log(id, KEEP[id] || '');
}
if (!all) fs.writeFileSync('data/cutouts.js', '// Figures cut out of the artworks in data/art.js (Art Institute of Chicago, CC0). See tools/build-cutouts.mjs.\nwindow.CUTOUTS=' + JSON.stringify(list) + ';\n');
