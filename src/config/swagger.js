import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SBE Voting System API',
      version: '1.0.0',
      description: `
A multi-purpose voting platform that can be used by schools, organizations, 
companies and governments for any kind of election or voting campaign.

## Authentication
This API uses **Access Token + Refresh Token** authentication.
- After login, you receive an \`accessToken\` (15 min) and a \`refreshToken\` (7 days)
- Pass the \`accessToken\` in the \`Authorization\` header as \`Bearer <token>\`
- When the access token expires, call \`POST /api/users/refresh\` to get a new one
- Call \`POST /api/users/logout\` to invalidate the refresh token
      `
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your access token here'
        }
      },
      schemas: {
        // ── User ──────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Chibuzor Mekalam' },
            email: { type: 'string', example: 'user@example.com' },
            role: {
              type: 'string',
              enum: ['VOTER', 'ORG_ADMIN', 'SUPER_ADMIN'],
              example: 'VOTER'
            },
            isVerified: { type: 'boolean', example: true },
            avatarUrl: {
              type: 'string',
              nullable: true,
              example: 'https://res.cloudinary.com/...'
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        // ── Organization ──────────────────────────────────────
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'First Bank Nigeria' },
            slug: { type: 'string', example: 'first-bank-nigeria' },
            description: { type: 'string', nullable: true },
            status: {
              type: 'string',
              enum: ['PENDING', 'APPROVED', 'REJECTED'],
              example: 'APPROVED'
            },
            logoUrl: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        // ── Campaign ──────────────────────────────────────────
        Campaign: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Class Rep Election 2024' },
            description: { type: 'string', nullable: true },
            accessType: {
              type: 'string',
              enum: ['PUBLIC', 'ORG_MEMBERS_ONLY', 'INVITE_ONLY'],
              example: 'PUBLIC'
            },
            votingType: {
              type: 'string',
              enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'],
              example: 'SINGLE_CHOICE'
            },
            status: {
              type: 'string',
              enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'],
              example: 'ACTIVE'
            },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        // ── Candidate ─────────────────────────────────────────
        Candidate: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            photoUrl: {
              type: 'string',
              example: 'https://res.cloudinary.com/...'
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                avatarUrl: { type: 'string', nullable: true }
              }
            },
            votes: { type: 'integer', example: 42 },
            percentage: { type: 'string', example: '47.3' }
          }
        },
        // ── Error ─────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'An error occurred.' }
          }
        },
        // ── Success ───────────────────────────────────────────
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful.' }
          }
        }
      }
    }
  },
  // Scan all router files for JSDoc comments
  apis: ['./src/router/*.js']
}

const swaggerSpec = swaggerJsdoc(options)

export default swaggerSpec
