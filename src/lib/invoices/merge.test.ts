import assert from "node:assert/strict";
import {
  parseGoogleDocId,
  replacePlaceholdersInXml,
} from "./merge";

const vars = { client_name: "Auxilio Partners", total: "$5.60" };

assert.equal(
  replacePlaceholdersInXml("Bill to {{client_name}}", vars),
  "Bill to Auxilio Partners"
);

const split =
  "<w:t>{{</w:t></w:r><w:r><w:t>client_name</w:t></w:r><w:r><w:t>}}</w:t>";
assert.equal(
  replacePlaceholdersInXml(split, vars),
  "<w:t>Auxilio Partners</w:t></w:r><w:r><w:t></w:t></w:r><w:r><w:t></w:t>"
);

assert.equal(
  parseGoogleDocId(
    "https://docs.google.com/document/d/abc123XYZ/edit?usp=sharing"
  ),
  "abc123XYZ"
);

console.log("invoice merge tests ok");
