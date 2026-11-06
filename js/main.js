// 실제 사이트: 데이터 저장소 forcsoz/forcsoz-data(비공개, core) + 공개 사이트 forcsoz.github.io(access 목록·keyring) + 파일 저장소 forcsoz/files-N
import core from './core/index.js';
import { makeAccess } from './tiers.js';
import { createSite } from './site.js';
import { fetchPublic } from './files.js';
import { startApp } from './app.js';

const access = makeAccess({ kvName: 'forcsoz-access' });
startApp({ core, access, site: createSite({ access }), read: fetchPublic, filesOpts: {} });
