// Seed test data into DynamoDB
// This populates the database with sample data for testing

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

const tables = {
  clients: "turnkey-clients",
  leads: "turnkey-leads",
  pipeline: "turnkey-pipeline"
};

// Sample data for each table
const sampleClients = [
  {
    tenant_id: "default",
    id: "client-1",
    name: "ABC Construction Corp",
    email: "contact@abconstr.com",
    phone: "561-555-0101",
    domain: "abconstr.com",
    industry: "Construction",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 250,
    revenue: "$25M-$50M",
    description: "General construction company specializing in commercial buildings",
    linkedin_url: "https://linkedin.com/company/abc-construction",
    created_at: new Date().toISOString()
  },
  {
    tenant_id: "default",
    id: "client-2",
    name: "Sunrise Builders Inc",
    email: "info@sunrisebuilders.com",
    phone: "561-555-0102",
    domain: "sunrisebuilders.com",
    industry: "Construction",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 180,
    revenue: "$10M-$25M",
    description: "Residential and commercial builder",
    linkedin_url: "https://linkedin.com/company/sunrise-builders",
    created_at: new Date().toISOString()
  },
  {
    tenant_id: "default",
    id: "client-3",
    name: "Elite Contractors LLC",
    email: "team@elitecontractors.com",
    phone: "561-555-0103",
    domain: "elitecontractors.com",
    industry: "Construction",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 320,
    revenue: "$50M-$100M",
    description: "High-end commercial contractor",
    linkedin_url: "https://linkedin.com/company/elite-contractors",
    created_at: new Date().toISOString()
  }
];

const sampleLeads = [
  {
    tenant_id: "default",
    id: "lead-1",
    name: "John Smith",
    email: "john@abcconstruction.com",
    phone: "561-555-1001",
    company: "ABC Construction Corp",
    status: "new",
    notes: "Interested in staffing services",
    created_at: new Date().toISOString()
  },
  {
    tenant_id: "default",
    id: "lead-2",
    name: "Sarah Johnson",
    email: "sarah@sunrisebuilders.com",
    phone: "561-555-1002",
    company: "Sunrise Builders Inc",
    status: "contacted",
    notes: "Interested in our staffing services",
    created_at: new Date().toISOString()
  },
  {
    tenant_id: "default",
    id: "lead-3",
    name: "Mike Williams",
    email: "mike@elitecontractors.com",
    phone: "561-555-1003",
    company: "Elite Contractors LLC",
    status: "qualified",
    notes: "Looking for 5+ candidates",
    created_at: new Date().toISOString()
  }
];

const samplePipeline = [
  {
    tenant_id: "default",
    id: "pipeline-1",
    name: "Staffing Proposal - ABC Construction",
    company: "ABC Construction Corp",
    value: 50000,
    status: "new",
    notes: "Proposal for 10 temporary workers",
    created_at: new Date().toISOString()
  },
  {
    tenant_id: "default",
    id: "pipeline-2",
    name: "Direct Hire - Sunrise Builders",
    company: "Sunrise Builders Inc",
    value: 75000,
    status: "contacted",
    notes: "Direct hire for Project Manager",
    created_at: new Date().toISOString()
  }
];

async function seedTable(tableName, items) {
  console.log(`Seeding ${tableName}...`);
  for (const item of items) {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: item
    }));
    console.log(`  Added: ${item.name || item.id}`);
  }
  console.log(`Done seeding ${tableName}!\n`);
}

async function main() {
  console.log("=== Seeding Turnkey Database ===\n");
  
  await seedTable(tables.clients, sampleClients);
  await seedTable(tables.leads, sampleLeads);
  await seedTable(tables.pipeline, samplePipeline);
  
  console.log("=== Database seeded successfully! ===");
  console.log("\nNow login to the dashboard to see the data.");
}

main().catch(console.error);
