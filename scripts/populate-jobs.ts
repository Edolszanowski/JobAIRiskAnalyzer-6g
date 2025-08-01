import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Sample occupation codes (in production, this would be the full 850+ list)
const OCCUPATION_CODES = [
  "11-1011", // Chief Executives
  "11-1021", // General and Operations Managers
  "11-2021", // Marketing Managers
  "11-3021", // Computer and Information Systems Managers
  "15-1211", // Computer Systems Analysts
  "15-1212", // Information Security Analysts
  "15-1252", // Software Developers
  "15-1254", // Web Developers
  "25-2021", // Elementary School Teachers
  "25-2031", // Secondary School Teachers
  "29-1141", // Registered Nurses
  "29-1171", // Nurse Practitioners
  "33-3051", // Police and Sheriff's Patrol Officers
  "35-3031", // Waiters and Waitresses
  "41-2011", // Cashiers
  "41-2031", // Retail Salespersons
  "43-4051", // Customer Service Representatives
  "43-9061", // Office Clerks, General
  "47-2031", // Carpenters
  "47-2111", // Electricians
  "49-3023", // Automotive Service Technicians and Mechanics
  "53-3032", // Heavy and Tractor-Trailer Truck Drivers
]

const JOB_TITLES: { [key: string]: string } = {
  "11-1011": "Chief Executives",
  "11-1021": "General and Operations Managers",
  "11-2021": "Marketing Managers",
  "11-3021": "Computer and Information Systems Managers",
  "15-1211": "Computer Systems Analysts",
  "15-1212": "Information Security Analysts",
  "15-1252": "Software Developers",
  "15-1254": "Web Developers",
  "25-2021": "Elementary School Teachers",
  "25-2031": "Secondary School Teachers",
  "29-1141": "Registered Nurses",
  "29-1171": "Nurse Practitioners",
  "33-3051": "Police and Sheriff's Patrol Officers",
  "35-3031": "Waiters and Waitresses",
  "41-2011": "Cashiers",
  "41-2031": "Retail Salespersons",
  "43-4051": "Customer Service Representatives",
  "43-9061": "Office Clerks, General",
  "47-2031": "Carpenters",
  "47-2111": "Electricians",
  "49-3023": "Automotive Service Technicians and Mechanics",
  "53-3032": "Heavy and Tractor-Trailer Truck Drivers",
}

function calculateAIImpactScore(occupationCode: string): number {
  // Simplified AI impact calculation based on occupation type
  const code = occupationCode.split("-")[0]

  switch (code) {
    case "11": // Management
      return Math.floor(Math.random() * 30) + 20 // 20-50%
    case "15": // Computer and Mathematical
      return Math.floor(Math.random() * 40) + 10 // 10-50%
    case "25": // Education
      return Math.floor(Math.random() * 25) + 10 // 10-35%
    case "29": // Healthcare
      return Math.floor(Math.random() * 20) + 5 // 5-25%
    case "33": // Protective Service
      return Math.floor(Math.random() * 30) + 15 // 15-45%
    case "35": // Food Preparation
      return Math.floor(Math.random() * 40) + 50 // 50-90%
    case "41": // Sales
      return Math.floor(Math.random() * 50) + 40 // 40-90%
    case "43": // Office and Administrative
      return Math.floor(Math.random() * 40) + 50 // 50-90%
    case "47": // Construction
      return Math.floor(Math.random() * 35) + 25 // 25-60%
    case "49": // Installation and Repair
      return Math.floor(Math.random() * 30) + 20 // 20-50%
    case "53": // Transportation
      return Math.floor(Math.random() * 45) + 35 // 35-80%
    default:
      return Math.floor(Math.random() * 60) + 20 // 20-80%
  }
}

function getAutomationRisk(aiScore: number): string {
  if (aiScore >= 80) return "Very High"
  if (aiScore >= 60) return "High"
  if (aiScore >= 40) return "Medium"
  return "Low"
}

async function populateJobs() {
  try {
    console.log("🚀 Starting job population process...")

    // Check if we have API keys
    const apiKeys = [process.env.BLS_API_KEY, process.env.BLS_API_KEY_2, process.env.BLS_API_KEY_3].filter(Boolean)

    if (apiKeys.length === 0) {
      console.log("⚠️ No BLS API keys found, using mock data...")
    } else {
      console.log(`🔑 Found ${apiKeys.length} BLS API key(s)`)
    }

    let processedCount = 0
    let successCount = 0
    let errorCount = 0

    for (const occupationCode of OCCUPATION_CODES) {
      try {
        console.log(`📊 Processing ${occupationCode}: ${JOB_TITLES[occupationCode]}`)

        // Check if job already exists
        const existing = await sql`
          SELECT occ_code FROM jobs WHERE occ_code = ${occupationCode}
        `

        if (existing.length > 0) {
          console.log(`⏭️ Job ${occupationCode} already exists, skipping...`)
          processedCount++
          continue
        }

        // Generate mock employment and wage data
        const employment2023 = Math.floor(Math.random() * 500000) + 10000
        const projectedEmployment2033 = Math.floor(employment2023 * (0.8 + Math.random() * 0.4))
        const medianWage = Math.floor(Math.random() * 80000) + 30000

        // Calculate AI impact
        const aiImpactScore = calculateAIImpactScore(occupationCode)
        const automationRisk = getAutomationRisk(aiImpactScore)

        // Insert job data
        await sql`
          INSERT INTO jobs (
            occ_code, occ_title, employment_2023, projected_employment_2033,
            median_wage, ai_impact_score, automation_risk, created_at, updated_at
          ) VALUES (
            ${occupationCode}, ${JOB_TITLES[occupationCode]}, ${employment2023}, 
            ${projectedEmployment2033}, ${medianWage}, ${aiImpactScore}, 
            ${automationRisk}, NOW(), NOW()
          )
        `

        successCount++
        console.log(`✅ Successfully processed ${occupationCode} (AI Risk: ${aiImpactScore}%)`)

        // Add small delay to be respectful
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`❌ Error processing ${occupationCode}:`, error)
        errorCount++
      }

      processedCount++
    }

    console.log("\n🎉 Job population completed!")
    console.log(`📊 Summary:`)
    console.log(`   Total processed: ${processedCount}`)
    console.log(`   Successful: ${successCount}`)
    console.log(`   Errors: ${errorCount}`)

    // Show final database stats
    const totalJobs = await sql`SELECT COUNT(*) as count FROM jobs`
    const jobsWithAI = await sql`SELECT COUNT(*) as count FROM jobs WHERE ai_impact_score IS NOT NULL`

    console.log(`\n📈 Database Stats:`)
    console.log(`   Total jobs in database: ${totalJobs[0].count}`)
    console.log(`   Jobs with AI analysis: ${jobsWithAI[0].count}`)
  } catch (error) {
    console.error("❌ Job population failed:", error)
    process.exit(1)
  }
}

// Run the population script
populateJobs()
