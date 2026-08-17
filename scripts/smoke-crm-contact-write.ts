import {
  alreadyUsedCrmWrite,
  crmWriteNudgeForQuery,
  shouldNudgeCrmWrite,
  shouldRetryCrmWrite,
  wantsCrmCreateFromQuery,
  wantsMissingContactPosted,
} from "../src/lib/ai/crm-write-loop";
import { matchCompanyByName } from "../src/lib/db/repositories/client-repository";

let failed = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log((cond ? "OK  " : "FAIL") + ` ${name}: ${detail}`);
  if (!cond) failed += 1;
}

check(
  "missing_david",
  wantsMissingContactPosted("company is there but David is not"),
  "screenshot phrasing"
);
check(
  "missing_posted",
  wantsMissingContactPosted(
    "David Marinelli at Cascade. the company is there but no contact was posted"
  ),
  "no contact was posted"
);
check(
  "not_generic_chat",
  !wantsMissingContactPosted("what companies do we have"),
  "plain list question"
);
check(
  "create_query",
  wantsCrmCreateFromQuery("company is there but David is not"),
  "missing contact counts as a CRM write"
);

const companies = [
  { id: "1", name: "Cascade" },
  { id: "2", name: "Cascade Health Systems" },
];
check(
  "exact_cascade",
  matchCompanyByName(companies, "Cascade")?.id === "1",
  "exact name wins over longer contains"
);
check(
  "unique_fuzzy",
  matchCompanyByName([{ id: "9", name: "Chick-fil-A" }], "Chick Fil A")?.id ===
    "9",
  "normalized unique match"
);
check(
  "ambiguous",
  matchCompanyByName(companies, "Casc") == null,
  "short/ambiguous does not steal a company"
);

check(
  "nudge_first_turn",
  shouldNudgeCrmWrite("company is there but David is not", 0, 6, []),
  "nudge before lookup"
);
check(
  "nudge_after_lookup",
  shouldNudgeCrmWrite(
    "company is there but David is not",
    1,
    6,
    ["internal_data"]
  ),
  "nudge after INTERNAL_DATA"
);
check(
  "no_nudge_after_write",
  !shouldNudgeCrmWrite(
    "company is there but David is not",
    1,
    6,
    ["create_contact"]
  ),
  "stop after create_contact"
);
check(
  "retry_until_write",
  shouldRetryCrmWrite("no contact was posted", ["internal_data"]),
  "retry if model only looked up"
);
check(
  "used_write",
  alreadyUsedCrmWrite(["create_company_with_primary_contact"]),
  "compound write counts"
);
check(
  "nudge_text",
  /create_contact/.test(
    crmWriteNudgeForQuery("the company is there but no contact was posted")
  ) && !/create_company_with_primary_contact/.test(
    crmWriteNudgeForQuery("the company is there but no contact was posted")
  ),
  "missing-contact nudge posts contact, does not duplicate company"
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll CRM contact-write smoke checks passed");
