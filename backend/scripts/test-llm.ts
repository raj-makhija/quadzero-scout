import 'dotenv/config';
import { getLLMProvider, parseResume } from '../src/lib/llm/index.js';

const sampleResume = `
JOHN DOE
Senior Software Engineer
Email: john.doe@email.com | Phone: +1-555-123-4567
Location: San Francisco, CA

SUMMARY
Experienced software engineer with 8+ years of expertise in full-stack development,
specializing in React, Node.js, and cloud technologies.

EXPERIENCE

Senior Software Engineer | TechCorp Inc. | 2020 - Present
- Led development of microservices architecture using Node.js and AWS
- Mentored team of 5 junior developers
- Implemented CI/CD pipelines reducing deployment time by 60%

Software Engineer | StartupXYZ | 2017 - 2020
- Built React frontend applications serving 100k+ users
- Developed REST APIs with Express.js and PostgreSQL
- Integrated third-party payment systems

Junior Developer | WebAgency | 2015 - 2017
- Developed responsive websites using HTML, CSS, JavaScript
- Maintained WordPress sites for clients

SKILLS
Primary: JavaScript, TypeScript, React, Node.js, AWS, PostgreSQL
Secondary: Python, Docker, Kubernetes, GraphQL

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley | 2015

CERTIFICATIONS
- AWS Solutions Architect Associate
- Google Cloud Professional Developer
`;

async function main() {
  console.log('Testing LLM Integration...\n');

  const provider = getLLMProvider();
  console.log(`Using provider: ${provider.name}`);
  console.log('---\n');

  try {
    console.log('Parsing sample resume...\n');
    const result = await parseResume(sampleResume);

    console.log('Parsed Result:');
    console.log(JSON.stringify(result.output, null, 2));
    console.log(`\nConfidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log('\nLLM integration test PASSED!');
  } catch (error) {
    console.error('LLM integration test FAILED:', error);
    process.exit(1);
  }
}

main();
