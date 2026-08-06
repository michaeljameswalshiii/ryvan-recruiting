import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const tenantId = "tenant-2024-001";
const candidateId = "5d0e6268-28c8-44d9-ac20-e3ac95bc027a";
const jobId = "7fd65b4d-c201-4d5a-8eb2-6f95534b64b5";
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

const lead = await get("turnkey-leads", candidateId);
const linkedJobs = Array.isArray(lead.linkedJobs) ? [...lead.linkedJobs] : [];
const leadIndex = linkedJobs.findIndex((item) => String(item.jobId) === jobId);
if (leadIndex < 0) throw new Error("Finance application missing from candidate");

const job = await get("turnkey-jobs", jobId);
const candidates = Array.isArray(job.candidates) ? [...job.candidates] : [];
const jobIndex = candidates.findIndex(
  (item) => String(item.candidateId) === candidateId,
);
if (jobIndex < 0) throw new Error("Candidate missing from Finance job");

const beforeLeadStage = linkedJobs[leadIndex].stage;
const beforeJobStage = candidates[jobIndex].stage;
const changedAt = new Date().toISOString();
const stageFields = {
  stage: "rejected",
  stageUpdatedAt: changedAt,
  stageUpdatedBy: "Administrative correction",
  rejectedAt: changedAt,
};
linkedJobs[leadIndex] = { ...linkedJobs[leadIndex], ...stageFields };
candidates[jobIndex] = { ...candidates[jobIndex], ...stageFields };

console.log({
  candidate: lead.name,
  job: job.title,
  leadStage: `${beforeLeadStage} -> rejected`,
  jobStage: `${beforeJobStage} -> rejected`,
  mode: execute ? "execute" : "dry-run",
});

if (execute) {
  await client.send(
    new UpdateItemCommand({
      TableName: "turnkey-leads",
      Key: marshall({ tenant_id: tenantId, id: candidateId }),
      UpdateExpression: "SET linkedJobs = :items, modified_at = :modified",
      ExpressionAttributeValues: marshall({
        ":items": linkedJobs,
        ":modified": changedAt,
      }),
    }),
  );
  await client.send(
    new UpdateItemCommand({
      TableName: "turnkey-jobs",
      Key: marshall({ tenant_id: tenantId, id: jobId }),
      UpdateExpression: "SET candidates = :items, modified_at = :modified",
      ExpressionAttributeValues: marshall({
        ":items": candidates,
        ":modified": changedAt,
      }),
    }),
  );
  console.log("Finance Implementation Specialist application is now rejected.");
}
