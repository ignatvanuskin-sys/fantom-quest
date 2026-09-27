'use strict';

/**
 * CLI: сброс базы к исходным данным.
 *   node src/seed.js          — показать, что будет создано
 *   node src/seed.js --reset  — перезаписать data/db.json
 */

const store = require('./store');
const { createDefaultData } = require('./seed-data');
const config = require('./config');

async function main() {
  const reset = process.argv.includes('--reset');
  const defaults = createDefaultData();

  if (!reset) {
    console.log('Сухой прогон. Будет создано:');
    console.log(`  сценариев: ${defaults.quests.length}`);
    console.log(`  локаций:   ${defaults.locations.length}`);
    console.log(`  FAQ:       ${defaults.faq.length}`);
    console.log(`  отзывов:   ${defaults.reviews.length} (все помечены «нужно подтвердить»)`);
    console.log(`  файл БД:   ${config.dbFile}`);
    console.log('\nДля перезаписи выполните: npm run seed');
    return;
  }

  await store.resetToDefaults();
  console.log(`База пересоздана: ${config.dbFile}`);
  console.log('Все непроверенные значения помечены confirmed:false — заполните их через админку /admin.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
