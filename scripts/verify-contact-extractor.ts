import { extractContactRecordFromUrl } from "../src/lib/web/contact-extractor";

const url = process.argv[2] || "https://byvertek.com/contact-us/";

async function main() {
  const result = await extractContactRecordFromUrl(url);
  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ["companyName_present", Boolean(result.companyName)],
    ["email_present", Boolean(result.email)],
    ["website_present", Boolean(result.website)],
    ["description_present", Boolean(result.description)],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(ok ? `OK  ${name}` : `FAIL ${name}`);
    if (!ok) failed++;
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
