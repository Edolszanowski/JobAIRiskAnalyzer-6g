import { NextResponse } from "next/server"
import { sql, testDatabaseConnection } from "@/lib/database"

// Comprehensive list of BLS occupation codes (SOC codes)
const occupationCodes = [
  // Management Occupations
  "11-1011", // Chief Executives
  "11-1021", // General and Operations Managers
  "11-2021", // Marketing Managers
  "11-3021", // Computer and Information Systems Managers
  "11-9013", // Farmers, Ranchers, and Other Agricultural Managers

  // Computer and Mathematical Occupations
  "15-1211", // Computer Systems Analysts
  "15-1212", // Information Security Analysts
  "15-1221", // Computer and Information Research Scientists
  "15-1231", // Computer Network Support Specialists
  "15-1232", // Computer User Support Specialists
  "15-1241", // Computer Network Architects
  "15-1242", // Database Administrators
  "15-1243", // Database Architects
  "15-1244", // Network and Computer Systems Administrators
  "15-1251", // Computer Programmers
  "15-1252", // Software Developers
  "15-1253", // Software Quality Assurance Analysts and Testers
  "15-1254", // Web Developers
  "15-1255", // Web and Digital Interface Designers

  // Architecture and Engineering Occupations
  "17-1011", // Architects, Except Landscape and Naval
  "17-2051", // Civil Engineers
  "17-2061", // Computer Hardware Engineers
  "17-2071", // Electrical Engineers
  "17-2112", // Industrial Engineers
  "17-2141", // Mechanical Engineers

  // Life, Physical, and Social Science Occupations
  "19-1013", // Soil and Plant Scientists
  "19-1042", // Medical Scientists, Except Epidemiologists
  "19-2021", // Atmospheric and Space Scientists
  "19-3011", // Economists
  "19-3031", // Clinical, Counseling, and School Psychologists

  // Education, Training, and Library Occupations
  "25-1011", // Business Teachers, Postsecondary
  "25-1126", // Philosophy and Religion Teachers, Postsecondary
  "25-2021", // Elementary School Teachers, Except Special Education
  "25-2022", // Middle School Teachers, Except Special and Career/Technical Education
  "25-2031", // Secondary School Teachers, Except Special and Career/Technical Education
  "25-3021", // Self-Enrichment Education Teachers

  // Healthcare Practitioners and Technical Occupations
  "29-1011", // Chiropractors
  "29-1021", // Dentists, General
  "29-1041", // Optometrists
  "29-1051", // Pharmacists
  "29-1062", // Family Medicine Physicians
  "29-1063", // Internists, General
  "29-1141", // Registered Nurses
  "29-1171", // Nurse Practitioners
  "29-2061", // Licensed Practical and Licensed Vocational Nurses

  // Healthcare Support Occupations
  "31-1014", // Nursing Assistants
  "31-2021", // Physical Therapist Assistants
  "31-9011", // Massage Therapists
  "31-9091", // Dental Assistants
  "31-9092", // Medical Assistants

  // Protective Service Occupations
  "33-1012", // First-Line Supervisors of Police and Detectives
  "33-3012", // Correctional Officers and Jailers
  "33-3051", // Police and Sheriff's Patrol Officers
  "33-9032", // Security Guards

  // Food Preparation and Serving Related Occupations
  "35-1012", // First-Line Supervisors of Food Preparation and Serving Workers
  "35-2014", // Cooks, Restaurant
  "35-3011", // Bartenders
  "35-3031", // Waiters and Waitresses
  "35-3041", // Food Servers, Nonrestaurant

  // Personal Care and Service Occupations
  "39-5012", // Hairdressers, Hairstylists, and Cosmetologists
  "39-9011", // Childcare Workers
  "39-9021", // Personal Care Aides
  "39-9032", // Recreation Workers

  // Sales and Related Occupations
  "41-1011", // First-Line Supervisors of Retail Sales Workers
  "41-2011", // Cashiers
  "41-2031", // Retail Salespersons
  "41-3041", // Travel Agents
  "41-4012", // Sales Representatives, Wholesale and Manufacturing
  "41-9022", // Real Estate Sales Agents

  // Office and Administrative Support Occupations
  "43-1011", // First-Line Supervisors of Office and Administrative Support Workers
  "43-3031", // Bookkeeping, Accounting, and Auditing Clerks
  "43-4051", // Customer Service Representatives
  "43-4171", // Receptionists and Information Clerks
  "43-5032", // Dispatchers, Except Police, Fire, and Ambulance
  "43-6014", // Secretaries and Administrative Assistants
  "43-9061", // Office Clerks, General

  // Construction and Extraction Occupations
  "47-1011", // First-Line Supervisors of Construction Trades and Extraction Workers
  "47-2031", // Carpenters
  "47-2111", // Electricians
  "47-2141", // Painters, Construction and Maintenance
  "47-2152", // Plumbers, Pipefitters, and Steamfitters

  // Installation, Maintenance, and Repair Occupations
  "49-1011", // First-Line Supervisors of Mechanics, Installers, and Repairers
  "49-3023", // Automotive Service Technicians and Mechanics
  "49-9021", // Heating, Air Conditioning, and Refrigeration Mechanics and Installers
  "49-9041", // Industrial Machinery Mechanics
  "49-9071", // Maintenance and Repair Workers, General

  // Production Occupations
  "51-1011", // First-Line Supervisors of Production and Operating Workers
  "51-2092", // Team Assemblers
  "51-4121", // Welders, Cutters, Solderers, and Brazers
  "51-8013", // Power Plant Operators
  "51-9111", // Packaging and Filling Machine Operators and Tenders

  // Transportation and Material Moving Occupations
  "53-1047", // First-Line Supervisors of Transportation and Material Moving Workers
  "53-3032", // Heavy and Tractor-Trailer Truck Drivers
  "53-3033", // Light Truck Drivers
  "53-7062", // Laborers and Freight, Stock, and Material Movers, Hand
  "53-7064", // Packers and Packagers, Hand
]

// Occupation titles mapping
const occupationTitles: { [key: string]: string } = {
  "11-1011": "Chief Executives",
  "11-1021": "General and Operations Managers",
  "11-2021": "Marketing Managers",
  "11-3021": "Computer and Information Systems Managers",
  "11-9013": "Farmers, Ranchers, and Other Agricultural Managers",
  "15-1211": "Computer Systems Analysts",
  "15-1212": "Information Security Analysts",
  "15-1221": "Computer and Information Research Scientists",
  "15-1231": "Computer Network Support Specialists",
  "15-1232": "Computer User Support Specialists",
  "15-1241": "Computer Network Architects",
  "15-1242": "Database Administrators",
  "15-1243": "Database Architects",
  "15-1244": "Network and Computer Systems Administrators",
  "15-1251": "Computer Programmers",
  "15-1252": "Software Developers",
  "15-1253": "Software Quality Assurance Analysts and Testers",
  "15-1254": "Web Developers",
  "15-1255": "Web and Digital Interface Designers",
  "17-1011": "Architects, Except Landscape and Naval",
  "17-2051": "Civil Engineers",
  "17-2061": "Computer Hardware Engineers",
  "17-2071": "Electrical Engineers",
  "17-2112": "Industrial Engineers",
  "17-2141": "Mechanical Engineers",
  "19-1013": "Soil and Plant Scientists",
  "19-1042": "Medical Scientists, Except Epidemiologists",
  "19-2021": "Atmospheric and Space Scientists",
  "19-3011": "Economists",
  "19-3031": "Clinical, Counseling, and School Psychologists",
  "25-1011": "Business Teachers, Postsecondary",
  "25-1126": "Philosophy and Religion Teachers, Postsecondary",
  "25-2021": "Elementary School Teachers, Except Special Education",
  "25-2022": "Middle School Teachers, Except Special and Career/Technical Education",
  "25-2031": "Secondary School Teachers, Except Special and Career/Technical Education",
  "25-3021": "Self-Enrichment Education Teachers",
  "29-1011": "Chiropractors",
  "29-1021": "Dentists, General",
  "29-1041": "Optometrists",
  "29-1051": "Pharmacists",
  "29-1062": "Family Medicine Physicians",
  "29-1063": "Internists, General",
  "29-1141": "Registered Nurses",
  "29-1171": "Nurse Practitioners",
  "29-2061": "Licensed Practical and Licensed Vocational Nurses",
  "31-1014": "Nursing Assistants",
  "31-2021": "Physical Therapist Assistants",
  "31-9011": "Massage Therapists",
  "31-9091": "Dental Assistants",
  "31-9092": "Medical Assistants",
  "33-1012": "First-Line Supervisors of Police and Detectives",
  "33-3012": "Correctional Officers and Jailers",
  "33-3051": "Police and Sheriff's Patrol Officers",
  "33-9032": "Security Guards",
  "35-1012": "First-Line Supervisors of Food Preparation and Serving Workers",
  "35-2014": "Cooks, Restaurant",
  "35-3011": "Bartenders",
  "35-3031": "Waiters and Waitresses",
  "35-3041": "Food Servers, Nonrestaurant",
  "39-5012": "Hairdressers, Hairstylists, and Cosmetologists",
  "39-9011": "Childcare Workers",
  "39-9021": "Personal Care Aides",
  "39-9032": "Recreation Workers",
  "41-1011": "First-Line Supervisors of Retail Sales Workers",
  "41-2011": "Cashiers",
  "41-2031": "Retail Salespersons",
  "41-3041": "Travel Agents",
  "41-4012": "Sales Representatives, Wholesale and Manufacturing",
  "41-9022": "Real Estate Sales Agents",
  "43-1011": "First-Line Supervisors of Office and Administrative Support Workers",
  "43-3031": "Bookkeeping, Accounting, and Auditing Clerks",
  "43-4051": "Customer Service Representatives",
  "43-4171": "Receptionists and Information Clerks",
  "43-5032": "Dispatchers, Except Police, Fire, and Ambulance",
  "43-6014": "Secretaries and Administrative Assistants",
  "43-9061": "Office Clerks, General",
  "47-1011": "First-Line Supervisors of Construction Trades and Extraction Workers",
  "47-2031": "Carpenters",
  "47-2111": "Electricians",
  "47-2141": "Painters, Construction and Maintenance",
  "47-2152": "Plumbers, Pipefitters, and Steamfitters",
  "49-1011": "First-Line Supervisors of Mechanics, Installers, and Repairers",
  "49-3023": "Automotive Service Technicians and Mechanics",
  "49-9021": "Heating, Air Conditioning, and Refrigeration Mechanics and Installers",
  "49-9041": "Industrial Machinery Mechanics",
  "49-9071": "Maintenance and Repair Workers, General",
  "51-1011": "First-Line Supervisors of Production and Operating Workers",
  "51-2092": "Team Assemblers",
  "51-4121": "Welders, Cutters, Solderers, and Brazers",
  "51-8013": "Power Plant Operators",
  "51-9111": "Packaging and Filling Machine Operators and Tenders",
  "53-1047": "First-Line Supervisors of Transportation and Material Moving Workers",
  "53-3032": "Heavy and Tractor-Trailer Truck Drivers",
  "53-3033": "Light Truck Drivers",
  "53-7062": "Laborers and Freight, Stock, and Material Movers, Hand",
  "53-7064": "Packers and Packagers, Hand",
}

async function calculateAIImpact(
  occupationCode: string,
  occupationTitle: string,
): Promise<{
  aiImpactScore: number
  automationRisk: string
  skillsAtRisk: string[]
  skillsNeeded: string[]
  futureOutlook: string
}> {
  const title = occupationTitle.toLowerCase()
  let aiImpactScore = 30
  let automationRisk = "Medium"
  let skillsAtRisk: string[] = []
  let skillsNeeded: string[] = []
  let futureOutlook = ""

  // Very High Risk (80-95%): Highly routine, predictable jobs
  if (
    title.includes("cashier") ||
    title.includes("data entry") ||
    title.includes("telemarketer") ||
    title.includes("assembly") ||
    title.includes("fast food") ||
    title.includes("toll booth") ||
    title.includes("parking lot attendant") ||
    title.includes("library technician")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 80 // 80-95%
    automationRisk = "Very High"
    skillsAtRisk = [
      "Routine transactions",
      "Manual data entry",
      "Repetitive calculations",
      "Basic customer interactions",
      "Inventory counting",
      "Simple decision making",
    ]
    skillsNeeded = [
      "Customer relationship management",
      "Complex problem-solving",
      "Technology adaptation",
      "Emotional intelligence",
      "Process improvement",
      "Digital literacy",
    ]
    futureOutlook =
      "Very high risk of automation within 3-7 years. These roles will likely be fully automated or significantly reduced. Focus immediately on developing interpersonal skills, learning to work with AI systems, and transitioning to roles requiring human judgment and creativity."
  }
  // High Risk (65-79%): Routine cognitive work, some physical routine tasks
  else if (
    title.includes("bookkeeping") ||
    title.includes("tax preparer") ||
    title.includes("insurance claims") ||
    title.includes("loan officer") ||
    title.includes("paralegal") ||
    title.includes("proofreader") ||
    title.includes("translator") ||
    title.includes("radiologic technician")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 65 // 65-79%
    automationRisk = "High"
    skillsAtRisk = [
      "Routine analysis",
      "Standard procedures",
      "Document processing",
      "Basic calculations",
      "Pattern recognition",
      "Rule-based decisions",
    ]
    skillsNeeded = [
      "Strategic thinking",
      "Client consultation",
      "Complex analysis",
      "AI tool proficiency",
      "Regulatory expertise",
      "Risk assessment",
      "Relationship building",
    ]
    futureOutlook =
      "High risk of significant task automation within 5-10 years. While roles may not disappear entirely, they will be transformed. Focus on advisory aspects, complex problem-solving, and developing expertise in AI collaboration. Consider specializing in areas requiring human judgment and ethical decision-making."
  }
  // Medium-High Risk (50-64%): Mixed routine and non-routine tasks
  else if (
    title.includes("analyst") ||
    title.includes("accountant") ||
    title.includes("market research") ||
    title.includes("technical writer") ||
    title.includes("real estate agent") ||
    title.includes("insurance agent") ||
    title.includes("financial advisor")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 50 // 50-64%
    automationRisk = "Medium-High"
    skillsAtRisk = [
      "Routine analysis",
      "Report generation",
      "Basic research",
      "Standard presentations",
      "Simple forecasting",
      "Data compilation",
    ]
    skillsNeeded = [
      "Strategic consulting",
      "Complex data interpretation",
      "Client relationship management",
      "Creative problem solving",
      "Industry expertise",
      "AI-assisted analysis",
      "Ethical decision making",
    ]
    futureOutlook =
      "Moderate to high risk with significant role evolution expected. AI will handle routine analysis while humans focus on interpretation, strategy, and client relationships. Success requires embracing AI as a tool while developing uniquely human skills like empathy, creativity, and complex reasoning."
  }
  // Medium Risk (35-49%): Skilled trades, technical roles with human elements
  else if (
    title.includes("technician") ||
    title.includes("mechanic") ||
    title.includes("electrician") ||
    title.includes("plumber") ||
    title.includes("carpenter") ||
    title.includes("engineer") ||
    title.includes("programmer") ||
    title.includes("web developer")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 35 // 35-49%
    automationRisk = "Medium"
    skillsAtRisk = [
      "Routine diagnostics",
      "Standard installations",
      "Basic troubleshooting",
      "Code generation",
      "Simple designs",
      "Predictable maintenance",
    ]
    skillsNeeded = [
      "Complex problem diagnosis",
      "Custom solutions",
      "Safety management",
      "AI tool integration",
      "Continuous learning",
      "Customer communication",
      "Innovation and creativity",
    ]
    futureOutlook =
      "Moderate risk with AI augmenting rather than replacing core functions. AI will assist with diagnostics, planning, and routine tasks, allowing focus on complex problems, custom solutions, and innovation. Professionals should learn to collaborate with AI tools while maintaining hands-on expertise."
  }
  // Low-Medium Risk (20-34%): Roles requiring significant human interaction
  else if (
    title.includes("sales") ||
    title.includes("marketing") ||
    title.includes("human resources") ||
    title.includes("project manager") ||
    title.includes("consultant") ||
    title.includes("trainer") ||
    title.includes("coordinator")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 20 // 20-34%
    automationRisk = "Low-Medium"
    skillsAtRisk = [
      "Basic scheduling",
      "Simple reporting",
      "Routine communications",
      "Data collection",
      "Standard presentations",
    ]
    skillsNeeded = [
      "Relationship building",
      "Strategic thinking",
      "Emotional intelligence",
      "Complex negotiation",
      "Creative problem solving",
      "Leadership",
      "Change management",
    ]
    futureOutlook =
      "Low to moderate risk with AI enhancing productivity rather than replacing roles. AI will handle administrative tasks, data analysis, and routine communications, freeing professionals to focus on strategy, relationships, and creative problem-solving. Success requires strong interpersonal skills and strategic thinking."
  }
  // Low Risk (5-19%): High human interaction, creativity, care roles
  else if (
    title.includes("teacher") ||
    title.includes("therapist") ||
    title.includes("counselor") ||
    title.includes("social worker") ||
    title.includes("nurse") ||
    title.includes("doctor") ||
    title.includes("manager") ||
    title.includes("executive") ||
    title.includes("artist") ||
    title.includes("designer") ||
    title.includes("chef")
  ) {
    aiImpactScore = Math.floor(Math.random() * 15) + 5 // 5-19%
    automationRisk = "Low"
    skillsAtRisk = [
      "Administrative tasks",
      "Basic documentation",
      "Simple scheduling",
      "Routine assessments",
      "Standard reporting",
    ]
    skillsNeeded = [
      "Emotional intelligence",
      "Creative thinking",
      "Complex problem solving",
      "Leadership",
      "Ethical decision making",
      "AI collaboration",
      "Continuous learning",
      "Cultural competency",
    ]
    futureOutlook =
      "Low risk of automation with AI serving as a powerful assistant. AI will handle administrative tasks, provide data insights, and support decision-making, but human judgment, creativity, empathy, and complex reasoning remain irreplaceable. Focus on developing uniquely human skills while learning to leverage AI tools effectively."
  }
  // Default case - moderate risk
  else {
    aiImpactScore = Math.floor(Math.random() * 20) + 40 // 40-59%
    automationRisk = "Medium"
    skillsAtRisk = ["Routine tasks", "Standard procedures", "Basic data processing", "Simple analysis"]
    skillsNeeded = [
      "Critical thinking",
      "Adaptability",
      "Digital literacy",
      "Collaboration",
      "Continuous learning",
      "Problem solving",
    ]
    futureOutlook =
      "Moderate risk of automation with significant role evolution expected. Success will depend on adapting to work alongside AI systems, focusing on uniquely human skills, and continuously learning new technologies. Embrace AI as a tool while developing skills that complement automated systems."
  }

  return {
    aiImpactScore,
    automationRisk,
    skillsAtRisk,
    skillsNeeded,
    futureOutlook,
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json()

    console.log("=== Database Initialization API Called ===")
    console.log("Action:", action)

    // Test database connection first
    const connectionTest = await testDatabaseConnection()
    if (!connectionTest.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Database connection failed",
          message: "Unable to connect to database. Please check the configuration.",
          details: connectionTest.error,
        },
        { status: 500 },
      )
    }

    if (action === "create-table") {
      console.log("Creating jobs table...")

      try {
        await sql`
          CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            occ_code VARCHAR(10) UNIQUE NOT NULL,
            occ_title VARCHAR(255) NOT NULL,
            employment_2023 INTEGER,
            projected_employment_2033 INTEGER,
            employment_change_percent DECIMAL(5,2),
            median_wage DECIMAL(10,2),
            ai_impact_score INTEGER DEFAULT 0,
            automation_risk VARCHAR(20) DEFAULT 'Medium',
            skills_at_risk TEXT,
            skills_needed TEXT,
            future_outlook TEXT,
            job_description TEXT,
            education_required VARCHAR(100),
            work_experience VARCHAR(100),
            on_job_training VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `

        console.log("✅ Jobs table created successfully")

        return NextResponse.json({
          success: true,
          message: "Jobs table created successfully",
          action: "create-table",
        })
      } catch (error) {
        console.error("❌ Error creating jobs table:", error)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create table",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        )
      }
    }

    if (action === "populate-data") {
      console.log(`🚀 Starting job data population for ${occupationCodes.length} occupations...`)

      let successCount = 0
      let errorCount = 0
      let skippedCount = 0

      for (let i = 0; i < occupationCodes.length; i++) {
        const code = occupationCodes[i]
        const title = occupationTitles[code] || `Occupation ${code}`

        try {
          // Check if job already exists
          const existingJob = await sql`
            SELECT occ_code FROM jobs WHERE occ_code = ${code}
          `

          if (existingJob.length > 0) {
            skippedCount++
            continue
          }

          // Calculate AI impact analysis
          const aiAnalysis = await calculateAIImpact(code, title)

          // Generate realistic employment and wage data
          const estimatedEmployment = Math.floor(Math.random() * 500000) + 10000
          const projectedEmployment = Math.floor(estimatedEmployment * (0.9 + Math.random() * 0.2))
          const medianWage = Math.floor(Math.random() * 80000) + 30000

          // Insert job record
          await sql`
            INSERT INTO jobs (
              occ_code, occ_title, employment_2023, projected_employment_2033, 
              employment_change_percent, median_wage, ai_impact_score, automation_risk, 
              skills_at_risk, skills_needed, future_outlook
            ) VALUES (
              ${code}, ${title}, ${estimatedEmployment}, ${projectedEmployment},
              ${(((projectedEmployment - estimatedEmployment) / estimatedEmployment) * 100).toFixed(2)},
              ${medianWage}, ${aiAnalysis.aiImpactScore}, ${aiAnalysis.automationRisk},
              ${aiAnalysis.skillsAtRisk.join(", ")}, ${aiAnalysis.skillsNeeded.join(", ")},
              ${aiAnalysis.futureOutlook}
            )
          `

          successCount++

          // Add small delay to prevent overwhelming the database
          if (i % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        } catch (error) {
          console.error(`❌ Error processing ${code}:`, error)
          errorCount++
          continue
        }
      }

      console.log(`\n🎉 Job data population completed!`)
      console.log(`✅ Successfully processed: ${successCount} jobs`)
      console.log(`⏭️ Skipped existing: ${skippedCount} jobs`)
      console.log(`❌ Errors: ${errorCount} jobs`)

      return NextResponse.json({
        success: true,
        message: "Database populated successfully",
        action: "populate-data",
        stats: {
          total: occupationCodes.length,
          success: successCount,
          skipped: skippedCount,
          errors: errorCount,
        },
      })
    }

    if (action === "full-initialize") {
      console.log("🔧 Full database initialization...")

      // Step 1: Create table
      try {
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
        console.log("✅ Jobs table created")
      } catch (error) {
        console.error("❌ Error creating table:", error)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create table",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        )
      }

      // Step 2: Create job_codes table for BLS occupation codes
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

      // Step 3: Create indexes for better performance
      await sql`CREATE INDEX IF NOT EXISTS idx_jobs_occ_code ON jobs(occ_code)`
      await sql`CREATE INDEX IF NOT EXISTS idx_jobs_ai_impact ON jobs(ai_impact_score)`
      await sql`CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(occ_title)`
      await sql`CREATE INDEX IF NOT EXISTS idx_job_codes_occ_code ON job_codes(occ_code)`

      // Step 4: Insert some sample data if tables are empty
      const jobCount = await sql`SELECT COUNT(*) as count FROM jobs`

      if (Number.parseInt(jobCount[0].count) === 0) {
        console.log("📊 Inserting sample job data...")

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
      }

      // Verify tables were created
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('jobs', 'job_codes')
      `

      const createdTables = tables.map((row: any) => row.table_name)
      const finalJobCount = await sql`SELECT COUNT(*) as count FROM jobs`

      console.log("✅ Database initialization completed")

      return NextResponse.json({
        success: true,
        message: "Database initialized successfully",
        details: {
          tablesCreated: createdTables,
          sampleJobsInserted: Number.parseInt(finalJobCount[0].count),
          timestamp: new Date().toISOString(),
        },
      })
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid action",
        message: "Please specify a valid action: create-table, populate-data, or full-initialize",
      },
      { status: 400 },
    )
  } catch (error) {
    console.error("Database initialization error:", error)
    return NextResponse.json({
      success: false,
      error: "Initialization failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    })
  }
}
