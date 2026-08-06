import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const tenantId = "tenant-2024-001";
const candidateId = "5d0e6268-28c8-44d9-ac20-e3ac95bc027a";
const jobId = "7fd65b4d-c201-4d5a-8eb2-6f95534b64b5";
const priorEventSk = "EVENT#2026-08-04T17:49:46.197Z";
const execute = process.argv.includes("--execute");

const get = async (table, id) => {
  const result = await client.send(
    new GetItemCommand({
      TableName: table,
      Key: marshall({ tenant_id: tenantId, id }),
    }),
  );
  if (!result.Item) throw new Error(`${table} item not found: ${id}`);
  return unmarshall(result.Item);
};

const oldEventResult = await client.send(
  new QueryCommand({
    TableName: "turnkey-events",
    KeyConditionExpression: "PK = :pk AND SK = :sk",
    ExpressionAttributeValues: marshall({
      ":pk": `ENTITY#candidate#${candidateId}`,
      ":sk": priorEventSk,
    }),
  }),
);
if (!oldEventResult.Items?.length) throw new Error("Prior 80-point event not found");

const oldEvent = unmarshall(oldEventResult.Items[0]);
const metadata = oldEvent.metadata || {};
if (Number(metadata.fitScore) !== 80) {
  throw new Error(`Expected prior score 80, found ${metadata.fitScore}`);
}

const restoredFields = {
  fitScore: 80,
  fitGrade: metadata.fitGrade || "B",
  fitReasons: metadata.fitReasons || [],
  fitStrengths: metadata.fitStrengths || [],
  fitGaps: metadata.fitGaps || [],
  fitSummary: metadata.fitSummary || "Fit 80/100 · Grade B",
  fitScoredAt: oldEvent.createdAt,
};

const restoreLink = (link) => {
  const restored = { ...link, ...restoredFields };
  for (const key of [
    "fitDomainScore",
    "fitDomainGrade",
    "fitToolScore",
    "fitToolGrade",
    "fitToolApplicable",
  ]) {
    delete restored[key];
  }
  return restored;
};

const lead = await get("turnkey-leads", candidateId);
const linkedJobs = Array.isArray(lead.linkedJobs) ? [...lead.linkedJobs] : [];
const leadIndex = linkedJobs.findIndex((link) => String(link.jobId) === jobId);
if (leadIndex < 0) throw new Error("Finance application missing from candidate");
const leadBefore = linkedJobs[leadIndex];
linkedJobs[leadIndex] = restoreLink(leadBefore);

const job = await get("turnkey-jobs", jobId);
const candidates = Array.isArray(job.candidates) ? [...job.candidates] : [];
const jobIndex = candidates.findIndex(
  (link) => String(link.candidateId) === candidateId,
);
if (jobIndex < 0) throw new Error("Candidate missing from Finance job");
const jobBefore = candidates[jobIndex];
candidates[jobIndex] = restoreLink(jobBefore);

console.log({
  candidate: lead.name,
  job: metadata.jobTitle,
  leadScore: `${leadBefore.fitScore} -> ${linkedJobs[leadIndex].fitScore}`,
  jobScore: `${jobBefore.fitScore} -> ${candidates[jobIndex].fitScore}`,
  mode: execute ? "execute" : "dry-run",
});

if (execute) {
  const modifiedAt = new Date().toISOString();
  await client.send(
    new UpdateItemCommand({
      TableName: "turnkey-leads",
      Key: marshall({ tenant_id: tenantId, id: candidateId }),
      UpdateExpression: "SET linkedJobs = :links, modified_at = :modified",
      ExpressionAttributeValues: marshall({
        ":links": linkedJobs,
        ":modified": modifiedAt,
      }),
    }),
  );
  await client.send(
    new UpdateItemCommand({
      TableName: "turnkey-jobs",
      Key: marshall({ tenant_id: tenantId, id: jobId }),
      UpdateExpression: "SET candidates = :links, modified_at = :modified",
      ExpressionAttributeValues: marshall({
        ":links": candidates,
        ":modified": modifiedAt,
      }),
    }),
  );
  console.log("Restored Stephanie's Finance application score to 80 on both records.");
}
