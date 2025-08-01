#!/usr/bin/env node

import { neon } from "@neondatabase/serverless"

const https = require("https")
const sql = neon(process.env.DATABASE_URL)

const DATABASE_INIT_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

async function makeRequest(action) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ action })

    const options = {
      hostname: DATABASE_INIT_URL.replace("https://", "").replace("http://", ""),
      port: DATABASE_INIT_URL.includes("https") ? 443 : 3000,
      path: "/api/initialize-database",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    }

    const req = (DATABASE_INIT_URL.includes("https") ? https : require("http")).request(options, (res) => {
      let responseData = ""

      res.on("data", (chunk) => {
        responseData += chunk
      })

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData)
          resolve(result)
        } catch (error) {
          reject(new Error("Invalid JSON response"))
        }
      })
    })

    req.on("error", (error) => {
      reject(error)
    })

    req.write(data)
    req.end()
  })
}

async function initializeDatabase() {
  console.log("🗄️ Initializing database...")

  try {
    // Create jobs table
    await sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        occ_code VARCHAR(10) UNIQUE NOT NULL,
        occ_title VARCHAR(255) NOT NULL,
        employment_2023 INTEGER,
        projected_employment_2033 INTEGER,
        median_wage INTEGER,
        ai_impact_score INTEGER,
        automation_risk VARCHAR(20),
        key_tasks TEXT,
        ai_analysis TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create job_codes table
    await sql`
      CREATE TABLE IF NOT EXISTS job_codes (
        id SERIAL PRIMARY KEY,
        occ_code VARCHAR(10) UNIQUE NOT NULL,
        occ_title VARCHAR(255) NOT NULL,
        major_group VARCHAR(100),
        minor_group VARCHAR(100),
        broad_occupation VARCHAR(100),
        detailed_occupation VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_occ_code ON jobs(occ_code)`
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_ai_impact ON jobs(ai_impact_score)`
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(occ_title)`
    await sql`CREATE INDEX IF NOT EXISTS idx_job_codes_occ_code ON job_codes(occ_code)`

    console.log("✅ Database tables created successfully")

    // Insert sample data
    const sampleJobs = [
      {
        code: "15-1252",
        title: "Software Developers",
        employment: 1847900,
        projected: 2049500,
        wage: 130160,
        aiScore: 25,
        risk: "Low",
      },
      {
        code: "43-4051",
        title: "Customer Service Representatives",
        employment: 2820000,
        projected: 2765400,
        wage: 38650,
        aiScore: 85,
        risk: "Very High",
      },
      {
        code: "41-2011",
        title: "Cashiers",
        employment: 3298000,
        projected: 3133200,
        wage: 29720,
        aiScore: 92,
        risk: "Very High",
      },
      {
        code: "29-1141",
        title: "Registered Nurses",
        employment: 3205000,
        projected: 3347400,
        wage: 81220,
        aiScore: 15,
        risk: "Low",
      },
      {
        code: "25-2021",
        title: "Elementary School Teachers",
        employment: 1472000,
        projected: 1472800,
        wage: 63930,
        aiScore: 20,
        risk: "Low",
      },
    ]

    for (const job of sampleJobs) {
      await sql`
        INSERT INTO jobs (
          occ_code, occ_title, employment_2023, projected_employment_2033,
          median_wage, ai_impact_score, automation_risk, created_at, updated_at
        ) VALUES (
          ${job.code}, ${job.title}, ${job.employment}, ${job.projected},
          ${job.wage}, ${job.aiScore}, ${job.risk}, NOW(), NOW()
        )
        ON CONFLICT (occ_code) DO NOTHING
      `
    }

    console.log("✅ Sample data inserted successfully")
    console.log("🎉 Database initialization complete!")
  } catch (error) {
    console.error("❌ Database initialization failed:", error)
    process.exit(1)
  }
}

// Run the initialization
initializeDatabase()
