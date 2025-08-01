#!/usr/bin/env node

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL)

async function setupDatabase() {
  try {
    console.log("🚀 Setting up iThriveAI database...")

    // Drop existing tables if they exist (for clean setup)
    console.log("🗑️ Dropping existing tables...")
    await sql`DROP TABLE IF EXISTS jobs CASCADE`
    await sql`DROP TABLE IF EXISTS job_codes CASCADE`

    // Create jobs table with comprehensive schema
    console.log("📊 Creating jobs table...")
    await sql`
      CREATE TABLE jobs (
        id SERIAL PRIMARY KEY,
        occ_code VARCHAR(10) UNIQUE NOT NULL,
        occ_title VARCHAR(255) NOT NULL,
        employment_2023 INTEGER DEFAULT 0,
        projected_employment_2033 INTEGER DEFAULT 0,
        median_wage INTEGER DEFAULT 0,
        ai_impact_score INTEGER CHECK (ai_impact_score >= 0 AND ai_impact_score <= 100),
        automation_risk VARCHAR(20) CHECK (automation_risk IN ('Low', 'Medium', 'High', 'Very High')),
        key_tasks TEXT,
        ai_analysis TEXT,
        growth_rate DECIMAL(5,2),
        education_level VARCHAR(100),
        work_experience VARCHAR(100),
        on_job_training VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create job_codes table for BLS occupation classification
    console.log("📋 Creating job_codes table...")
    await sql`
      CREATE TABLE job_codes (
        id SERIAL PRIMARY KEY,
        occ_code VARCHAR(10) UNIQUE NOT NULL,
        occ_title VARCHAR(255) NOT NULL,
        major_group VARCHAR(100),
        minor_group VARCHAR(100),
        broad_occupation VARCHAR(100),
        detailed_occupation VARCHAR(255),
        soc_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create performance indexes
    console.log("🔍 Creating database indexes...")
    await sql`CREATE INDEX idx_jobs_occ_code ON jobs(occ_code)`
    await sql`CREATE INDEX idx_jobs_ai_impact ON jobs(ai_impact_score)`
    await sql`CREATE INDEX idx_jobs_automation_risk ON jobs(automation_risk)`
    await sql`CREATE INDEX idx_jobs_title_search ON jobs USING gin(to_tsvector('english', occ_title))`
    await sql`CREATE INDEX idx_jobs_wage ON jobs(median_wage)`
    await sql`CREATE INDEX idx_jobs_employment ON jobs(employment_2023)`
    await sql`CREATE INDEX idx_job_codes_occ_code ON job_codes(occ_code)`
    await sql`CREATE INDEX idx_job_codes_major_group ON job_codes(major_group)`

    // Insert comprehensive sample data
    console.log("📊 Inserting comprehensive sample data...")

    const sampleJobs = [
      // Management Occupations
      {
        code: "11-1011",
        title: "Chief Executives",
        employment: 200300,
        projected: 179900,
        wage: 189520,
        aiScore: 35,
        risk: "Medium",
        education: "Bachelor's degree",
        experience: "5 years or more",
        training: "None",
      },
      {
        code: "11-1021",
        title: "General and Operations Managers",
        employment: 2984200,
        projected: 3116600,
        wage: 103650,
        aiScore: 40,
        risk: "Medium",
        education: "Bachelor's degree",
        experience: "5 years or more",
        training: "None",
      },

      // Computer and Mathematical Occupations
      {
        code: "15-1252",
        title: "Software Developers",
        employment: 1847900,
        projected: 2049500,
        wage: 130160,
        aiScore: 25,
        risk: "Low",
        education: "Bachelor's degree",
        experience: "None",
        training: "None",
      },
      {
        code: "15-1212",
        title: "Information Security Analysts",
        employment: 165920,
        projected: 194500,
        wage: 112000,
        aiScore: 20,
        risk: "Low",
        education: "Bachelor's degree",
        experience: "Less than 5 years",
        training: "None",
      },

      // Healthcare Practitioners
      {
        code: "29-1141",
        title: "Registered Nurses",
        employment: 3205000,
        projected: 3347400,
        wage: 81220,
        aiScore: 15,
        risk: "Low",
        education: "Bachelor's degree",
        experience: "None",
        training: "None",
      },
      {
        code: "29-1171",
        title: "Nurse Practitioners",
        employment: 234000,
        projected: 350200,
        wage: 123780,
        aiScore: 10,
        risk: "Low",
        education: "Master's degree",
        experience: "None",
        training: "None",
      },

      // Education Occupations
      {
        code: "25-2021",
        title: "Elementary School Teachers, Except Special Education",
        employment: 1472000,
        projected: 1472800,
        wage: 63930,
        aiScore: 20,
        risk: "Low",
        education: "Bachelor's degree",
        experience: "None",
        training: "Internship/residency",
      },
      {
        code: "25-2031",
        title: "Secondary School Teachers, Except Special and Career/Technical Education",
        employment: 1073200,
        projected: 1040700,
        wage: 65220,
        aiScore: 18,
        risk: "Low",
        education: "Bachelor's degree",
        experience: "None",
        training: "Internship/residency",
      },

      // Sales and Related Occupations (High Risk)
      {
        code: "41-2011",
        title: "Cashiers",
        employment: 3298000,
        projected: 3133200,
        wage: 29720,
        aiScore: 92,
        risk: "Very High",
        education: "No formal educational credential",
        experience: "None",
        training: "Short-term on-the-job training",
      },
      {
        code: "41-2031",
        title: "Retail Salespersons",
        employment: 4672400,
        projected: 4569800,
        wage: 31920,
        aiScore: 75,
        risk: "High",
        education: "No formal educational credential",
        experience: "None",
        training: "Short-term on-the-job training",
      },

      // Office and Administrative Support (High Risk)
      {
        code: "43-4051",
        title: "Customer Service Representatives",
        employment: 2820000,
        projected: 2765400,
        wage: 38650,
        aiScore: 85,
        risk: "Very High",
        education: "High school diploma or equivalent",
        experience: "None",
        training: "Short-term on-the-job training",
      },
      {
        code: "43-9061",
        title: "Office Clerks, General",
        employment: 2840000,
        projected: 2682500,
        wage: 37030,
        aiScore: 88,
        risk: "Very High",
        education: "High school diploma or equivalent",
        experience: "None",
        training: "Short-term on-the-job training",
      },

      // Food Preparation and Serving (High Risk)
      {
        code: "35-3031",
        title: "Waiters and Waitresses",
        employment: 2237700,
        projected: 2252000,
        wage: 31940,
        aiScore: 70,
        risk: "High",
        education: "No formal educational credential",
        experience: "None",
        training: "Short-term on-the-job training",
      },

      // Construction and Extraction (Medium Risk)
      {
        code: "47-2031",
        title: "Carpenters",
        employment: 750000,
        projected: 775300,
        wage: 56350,
        aiScore: 45,
        risk: "Medium",
        education: "High school diploma or equivalent",
        experience: "None",
        training: "Apprenticeship",
      },
      {
        code: "47-2111",
        title: "Electricians",
        employment: 739200,
        projected: 756000,
        wage: 70040,
        aiScore: 35,
        risk: "Medium",
        education: "High school diploma or equivalent",
        experience: "None",
        training: "Apprenticeship",
      },

      // Transportation and Material Moving
      {
        code: "53-3032",
        title: "Heavy and Tractor-Trailer Truck Drivers",
        employment: 2063700,
        projected: 2133400,
        wage: 49920,
        aiScore: 65,
        risk: "High",
        education: "Postsecondary nondegree award",
        experience: "None",
        training: "Short-term on-the-job training",
      },
    ]

    for (const job of sampleJobs) {
      const growthRate = job.employment > 0 ? ((job.projected - job.employment) / job.employment) * 100 : 0

      const aiAnalysis = `This occupation has a ${job.risk.toLowerCase()} risk of automation with an AI impact score of ${job.aiScore}%. ${
        job.aiScore >= 80
          ? "High routine task content and limited human interaction make this role highly susceptible to automation."
          : job.aiScore >= 60
            ? "Moderate automation risk due to some routine tasks, but human judgment and interaction provide some protection."
            : job.aiScore >= 40
              ? "Medium automation risk with a mix of routine and complex tasks requiring human oversight."
              : "Low automation risk due to high levels of human interaction, creativity, and complex problem-solving requirements."
      }`

      await sql`
        INSERT INTO jobs (
          occ_code, occ_title, employment_2023, projected_employment_2033,
          median_wage, ai_impact_score, automation_risk, ai_analysis,
          growth_rate, education_level, work_experience, on_job_training,
          created_at, updated_at
        ) VALUES (
          ${job.code}, ${job.title}, ${job.employment}, ${job.projected},
          ${job.wage}, ${job.aiScore}, ${job.risk}, ${aiAnalysis},
          ${growthRate}, ${job.education}, ${job.experience}, ${job.training},
          NOW(), NOW()
        )
        ON CONFLICT (occ_code) DO NOTHING
      `
    }

    // Insert job codes data
    console.log("📋 Inserting job classification data...")
    const jobCodes = [
      {
        code: "11-1011",
        title: "Chief Executives",
        major: "Management",
        minor: "Top Executives",
        broad: "Top Executives",
        detailed: "Chief Executives",
      },
      {
        code: "11-1021",
        title: "General and Operations Managers",
        major: "Management",
        minor: "Top Executives",
        broad: "General and Operations Managers",
        detailed: "General and Operations Managers",
      },
      {
        code: "15-1252",
        title: "Software Developers",
        major: "Computer and Mathematical",
        minor: "Computer Occupations",
        broad: "Software and Web Developers",
        detailed: "Software Developers",
      },
      {
        code: "15-1212",
        title: "Information Security Analysts",
        major: "Computer and Mathematical",
        minor: "Computer Occupations",
        broad: "Information Security Analysts",
        detailed: "Information Security Analysts",
      },
      {
        code: "29-1141",
        title: "Registered Nurses",
        major: "Healthcare Practitioners and Technical",
        minor: "Health Diagnosing and Treating Practitioners",
        broad: "Registered Nurses",
        detailed: "Registered Nurses",
      },
      {
        code: "29-1171",
        title: "Nurse Practitioners",
        major: "Healthcare Practitioners and Technical",
        minor: "Health Diagnosing and Treating Practitioners",
        broad: "Nurse Anesthetists, Nurse Midwives, and Nurse Practitioners",
        detailed: "Nurse Practitioners",
      },
      {
        code: "25-2021",
        title: "Elementary School Teachers, Except Special Education",
        major: "Education, Training, and Library",
        minor: "Primary, Secondary, and Special Education School Teachers",
        broad: "Elementary and Middle School Teachers",
        detailed: "Elementary School Teachers, Except Special Education",
      },
      {
        code: "25-2031",
        title: "Secondary School Teachers, Except Special and Career/Technical Education",
        major: "Education, Training, and Library",
        minor: "Primary, Secondary, and Special Education School Teachers",
        broad: "Secondary School Teachers",
        detailed: "Secondary School Teachers, Except Special and Career/Technical Education",
      },
      {
        code: "41-2011",
        title: "Cashiers",
        major: "Sales and Related",
        minor: "Retail Sales Workers",
        broad: "Cashiers",
        detailed: "Cashiers",
      },
      {
        code: "41-2031",
        title: "Retail Salespersons",
        major: "Sales and Related",
        minor: "Retail Sales Workers",
        broad: "Retail Salespersons",
        detailed: "Retail Salespersons",
      },
      {
        code: "43-4051",
        title: "Customer Service Representatives",
        major: "Office and Administrative Support",
        minor: "Information and Record Clerks",
        broad: "Customer Service Representatives",
        detailed: "Customer Service Representatives",
      },
      {
        code: "43-9061",
        title: "Office Clerks, General",
        major: "Office and Administrative Support",
        minor: "Other Office and Administrative Support Workers",
        broad: "Office Clerks, General",
        detailed: "Office Clerks, General",
      },
      {
        code: "35-3031",
        title: "Waiters and Waitresses",
        major: "Food Preparation and Serving Related",
        minor: "Food and Beverage Serving Workers",
        broad: "Waiters and Waitresses",
        detailed: "Waiters and Waitresses",
      },
      {
        code: "47-2031",
        title: "Carpenters",
        major: "Construction and Extraction",
        minor: "Construction Trades Workers",
        broad: "Carpenters",
        detailed: "Carpenters",
      },
      {
        code: "47-2111",
        title: "Electricians",
        major: "Construction and Extraction",
        minor: "Construction Trades Workers",
        broad: "Electricians",
        detailed: "Electricians",
      },
      {
        code: "53-3032",
        title: "Heavy and Tractor-Trailer Truck Drivers",
        major: "Transportation and Material Moving",
        minor: "Motor Vehicle Operators",
        broad: "Heavy and Tractor-Trailer Truck Drivers",
        detailed: "Heavy and Tractor-Trailer Truck Drivers",
      },
    ]

    for (const jobCode of jobCodes) {
      await sql`
        INSERT INTO job_codes (
          occ_code, occ_title, major_group, minor_group, 
          broad_occupation, detailed_occupation, created_at
        ) VALUES (
          ${jobCode.code}, ${jobCode.title}, ${jobCode.major}, ${jobCode.minor},
          ${jobCode.broad}, ${jobCode.detailed}, NOW()
        )
        ON CONFLICT (occ_code) DO NOTHING
      `
    }

    // Verify setup
    const [jobCount] = await sql`SELECT COUNT(*) as count FROM jobs`
    const [codeCount] = await sql`SELECT COUNT(*) as count FROM job_codes`
    const [aiCount] = await sql`SELECT COUNT(*) as count FROM jobs WHERE ai_impact_score IS NOT NULL`

    console.log("\n✅ Database setup completed successfully!")
    console.log(`📊 Summary:`)
    console.log(`   Jobs table: ${jobCount.count} records`)
    console.log(`   Job codes table: ${codeCount.count} records`)
    console.log(`   Jobs with AI analysis: ${aiCount.count} records`)
    console.log(`   Database ready for production use!`)
  } catch (error) {
    console.error("❌ Database setup failed:", error)
    process.exit(1)
  }
}

setupDatabase()
