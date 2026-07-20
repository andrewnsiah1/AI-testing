// AWS service data for collectible orbs, the lesson screen, and the end-of-run quiz.
// Each service has a category (color-coded), a one-line fact, expanded lesson
// content (overview / analogy / practical use), and a quiz question.

export const CATEGORIES = {
  compute: { color: 0xf7931e, label: 'Compute' },
  storage: { color: 0x2ecc71, label: 'Storage' },
  database: { color: 0x3498db, label: 'Database' },
  networking: { color: 0x9b59b6, label: 'Networking' },
  security: { color: 0xe74c3c, label: 'Security' },
  integration: { color: 0x1abc9c, label: 'Serverless & Integration' },
};

// Fallback 3-choice questions used when the player has NOT unlocked notes
// for the quizzed service (skipped its orb) AND the dynamic backend is
// unreachable. These stay at the category level on purpose — they never
// name or test a specific service, matching what a player with no notes
// actually knows: just the color-coded category from the game.
export const CATEGORY_QUIZZES = {
  compute: {
    question: 'What do "Compute" services generally provide?',
    choices: ['Places to run your code/apps', 'Places to store files', 'DNS lookups'],
    correctIndex: 0,
    fact: 'Compute services give you somewhere to actually run code or applications, as opposed to just storing or routing data.',
  },
  storage: {
    question: 'What do "Storage" services generally provide?',
    choices: ['A place to run code', 'A place to keep data long-term', 'Network routing'],
    correctIndex: 1,
    fact: 'Storage services exist to durably hold onto data over time, separate from wherever the code that uses it runs.',
  },
  database: {
    question: 'What do "Database" services generally provide?',
    choices: ['Structured, queryable data storage', 'Video streaming', 'DNS routing'],
    correctIndex: 0,
    fact: 'Database services store data in a structured, queryable way, rather than as raw files.',
  },
  networking: {
    question: 'What do "Networking" services generally handle?',
    choices: ['Encrypting files at rest', 'How traffic moves and connects', 'Running containers'],
    correctIndex: 1,
    fact: 'Networking services control how traffic gets routed and connected between resources.',
  },
  security: {
    question: 'What do "Security" services generally handle?',
    choices: ['Access control and protecting data', 'Video rendering', 'Load balancing traffic'],
    correctIndex: 0,
    fact: 'Security services focus on controlling access and protecting data and resources.',
  },
  integration: {
    question: 'What do "Serverless & Integration" services generally do?',
    choices: ['Store large files', 'Connect and coordinate other services', 'Provide raw compute'],
    correctIndex: 1,
    fact: 'Serverless & Integration services connect and coordinate other services together, often without managing servers.',
  },
};

export const SERVICES = [
  {
    id: 'ec2',
    name: 'EC2',
    category: 'compute',
    fact: 'EC2 gives you a virtual server you fully control — you pick the CPU, memory, and OS.',
    overview:
      'Amazon EC2 (Elastic Compute Cloud) provides resizable virtual servers, called instances, that you can launch in minutes. You choose the hardware specs, operating system, and networking, and you are responsible for managing everything running on it.',
    analogy:
      'EC2 is like renting an empty apartment instead of buying a house. You get full control over what goes inside, but you also handle the furnishing, maintenance, and utilities yourself.',
    practicalUse:
      'A company running a custom web application with specific software dependencies might use EC2 instances instead of a managed service, since it needs full control over the server environment.',
    quiz: {
      question: 'What is Amazon EC2?',
      choices: [
        'A virtual server you configure and manage',
        'A managed NoSQL database',
        'A content delivery network',
        'A DNS routing service',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What is Amazon EC2?',
      choices: ['A virtual server you manage', 'A NoSQL database', 'A DNS service'],
      correctIndex: 0,
    },
  },
  {
    id: 'lambda',
    name: 'Lambda',
    category: 'compute',
    fact: 'Lambda runs your code without provisioning servers — you pay only for the milliseconds it runs.',
    overview:
      'AWS Lambda runs your code in response to events without you managing any servers. It automatically scales from zero to thousands of parallel executions and bills you only for the compute time you actually use.',
    analogy:
      'Lambda is like hiring a freelancer who shows up the instant a task appears, does the work, and leaves — you only pay for the time they spent on that specific task, not for keeping them on staff.',
    practicalUse:
      'An e-commerce site might use Lambda to automatically resize product images the moment they are uploaded, without needing to run a server around the clock waiting for uploads.',
    quiz: {
      question: 'What makes AWS Lambda different from EC2?',
      choices: [
        'It requires manual server patching',
        'It runs code on-demand without managing servers',
        'It only works with SQL databases',
        'It is a storage service',
      ],
      correctIndex: 1,
    },
    laneQuiz: {
      question: 'What makes Lambda different from EC2?',
      choices: ['Needs manual patching', 'Runs code with no servers to manage', 'Only stores files'],
      correctIndex: 1,
    },
  },
  {
    id: 'ecs',
    name: 'ECS',
    category: 'compute',
    fact: 'ECS runs and manages your Docker containers across a cluster, handling placement and scaling.',
    overview:
      'Amazon ECS (Elastic Container Service) runs and orchestrates Docker containers across a cluster of machines, deciding where each container runs and restarting it if it fails.',
    analogy:
      'ECS is like a shipping yard dispatcher who decides which cargo container goes on which truck and reroutes things automatically if a truck breaks down, so nothing has to be tracked by hand.',
    practicalUse:
      'A company that has already packaged its application into Docker containers might use ECS to run many copies of that container reliably across a fleet of servers without managing orchestration themselves.',
    quiz: {
      question: 'What does Amazon ECS manage?',
      choices: [
        'Email delivery',
        'DNS records',
        'Containers running your applications',
        'IAM permissions',
      ],
      correctIndex: 2,
    },
    laneQuiz: {
      question: 'What does ECS manage?',
      choices: ['Email delivery', 'Your app containers', 'IAM permissions'],
      correctIndex: 1,
    },
  },
  {
    id: 's3',
    name: 'S3',
    category: 'storage',
    fact: 'S3 stores any amount of data as objects in buckets — durable, and accessible over HTTP.',
    overview:
      'Amazon S3 (Simple Storage Service) stores data as objects inside buckets. It is designed for durability and virtually unlimited scale, and objects are accessible over standard HTTP requests.',
    analogy:
      'S3 is like a massive self-storage warehouse with unlimited units — you can drop off or pick up any amount of stuff at any time, and the warehouse handles keeping it safe.',
    practicalUse:
      'A streaming service might store all of its video files in S3, since it needs durable storage for huge amounts of data that can be retrieved from anywhere in the world.',
    quiz: {
      question: 'What kind of storage does Amazon S3 provide?',
      choices: [
        'Block storage for a single EC2 instance',
        'Object storage accessible over the internet',
        'In-memory caching',
        'A relational database',
      ],
      correctIndex: 1,
    },
    laneQuiz: {
      question: 'What kind of storage is S3?',
      choices: ['Block storage for EC2', 'Object storage over the internet', 'In-memory cache'],
      correctIndex: 1,
    },
  },
  {
    id: 'ebs',
    name: 'EBS',
    category: 'storage',
    fact: 'EBS provides persistent block storage that attaches to a single EC2 instance, like a virtual hard drive.',
    overview:
      'Amazon EBS (Elastic Block Store) provides persistent block-level storage volumes that attach to a single EC2 instance, functioning like a virtual hard drive that survives instance stops and restarts.',
    analogy:
      'EBS is like an external hard drive plugged into one specific computer — the data stays even if you turn the computer off, but it is tied to that one machine.',
    practicalUse:
      'A database running on an EC2 instance would typically store its data files on an EBS volume so the data persists independently of the instance\'s lifecycle.',
    quiz: {
      question: 'What is Amazon EBS used for?',
      choices: [
        'Serving static websites',
        'Sending push notifications',
        'Persistent block storage attached to EC2',
        'Running containers',
      ],
      correctIndex: 2,
    },
    laneQuiz: {
      question: 'What is EBS used for?',
      choices: ['Serving websites', 'Push notifications', 'Block storage for EC2'],
      correctIndex: 2,
    },
  },
  {
    id: 'dynamodb',
    name: 'DynamoDB',
    category: 'database',
    fact: 'DynamoDB is a fully managed NoSQL database that scales automatically with single-digit millisecond latency.',
    overview:
      'Amazon DynamoDB is a fully managed NoSQL key-value and document database. It scales automatically to handle massive request volumes while keeping response times in the single-digit milliseconds.',
    analogy:
      'DynamoDB is like a giant filing system organized by labeled folders instead of rigid spreadsheet columns — you can look up a folder instantly by its label, but you do not query across it the way you would a spreadsheet.',
    practicalUse:
      'A mobile game might use DynamoDB to store player profiles and session data, since it needs fast, predictable lookups by user ID at massive scale.',
    quiz: {
      question: 'What type of database is DynamoDB?',
      choices: [
        'A managed NoSQL key-value/document database',
        'A traditional relational (SQL) database',
        'A file storage system',
        'A message queue',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What type of database is DynamoDB?',
      choices: ['NoSQL key-value database', 'Relational SQL database', 'A message queue'],
      correctIndex: 0,
    },
  },
  {
    id: 'rds',
    name: 'RDS',
    category: 'database',
    fact: 'RDS manages relational databases like MySQL or PostgreSQL for you, handling backups and patching.',
    overview:
      'Amazon RDS (Relational Database Service) manages relational databases like MySQL, PostgreSQL, or SQL Server for you, automating tasks like backups, patching, and failover.',
    analogy:
      'RDS is like hiring a property manager for a rental house — you still own the house and decide what goes in it, but someone else handles the maintenance, repairs, and upkeep.',
    practicalUse:
      'A company building an accounting application that relies on structured tables and relationships between records would likely use RDS instead of building and maintaining a database server themselves.',
    quiz: {
      question: 'What does Amazon RDS simplify?',
      choices: [
        'Running relational databases without managing the underlying server',
        'Sending emails',
        'Storing large binary files',
        'Managing IAM roles',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What does RDS simplify?',
      choices: ['Running relational databases', 'Sending emails', 'Managing IAM roles'],
      correctIndex: 0,
    },
  },
  {
    id: 'vpc',
    name: 'VPC',
    category: 'networking',
    fact: 'A VPC is your own isolated network inside AWS, where you control subnets, routing, and access.',
    overview:
      'Amazon VPC (Virtual Private Cloud) lets you provision a logically isolated section of AWS where you define your own network: IP ranges, subnets, route tables, and gateways.',
    analogy:
      'A VPC is like a gated community you design yourself — you decide where the streets go, who can enter through which gate, and how the neighborhoods (subnets) are laid out.',
    practicalUse:
      'A company might put its database servers in a private subnet within a VPC so they are never directly reachable from the internet, while web servers sit in a public subnet that is.',
    quiz: {
      question: 'What is an Amazon VPC?',
      choices: [
        'A virtual private network isolated within AWS',
        'A type of database',
        'A billing dashboard',
        'A container orchestration service',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What is a VPC?',
      choices: ['An isolated virtual network', 'A type of database', 'A billing dashboard'],
      correctIndex: 0,
    },
  },
  {
    id: 'route53',
    name: 'Route 53',
    category: 'networking',
    fact: 'Route 53 is AWS\'s DNS service — it translates domain names into IP addresses and can route traffic intelligently.',
    overview:
      'Amazon Route 53 is a DNS (Domain Name System) service that translates human-readable domain names into IP addresses, and can also route traffic based on latency, health checks, or geography.',
    analogy:
      'Route 53 is like a phone book that not only tells you someone\'s number, but also automatically picks the nearest branch office to call if that person has offices in several cities.',
    practicalUse:
      'A global website might use Route 53 to route visitors from Europe to a European server and visitors from Asia to an Asian server, reducing latency for everyone.',
    quiz: {
      question: 'What is Route 53 primarily used for?',
      choices: [
        'Domain Name System (DNS) and traffic routing',
        'Encrypting data at rest',
        'Running serverless functions',
        'Object storage',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What is Route 53 used for?',
      choices: ['DNS and traffic routing', 'Encrypting data', 'Object storage'],
      correctIndex: 0,
    },
  },
  {
    id: 'iam',
    name: 'IAM',
    category: 'security',
    fact: 'IAM controls who can do what in your AWS account — users, roles, and fine-grained permissions.',
    overview:
      'AWS IAM (Identity and Access Management) controls who can authenticate into your AWS account and what actions they are allowed to perform, down to individual API calls on specific resources.',
    analogy:
      'IAM is like a building\'s keycard system — different employees get keycards that open different doors, and security can see exactly who went where and revoke access instantly.',
    practicalUse:
      'A company might create an IAM role that only allows a specific application to read from one S3 bucket, preventing that application from accidentally accessing or modifying anything else in the account.',
    quiz: {
      question: 'What does IAM control?',
      choices: [
        'Network bandwidth',
        'Who can access AWS resources and what they can do',
        'Database backups',
        'CDN caching',
      ],
      correctIndex: 1,
    },
    laneQuiz: {
      question: 'What does IAM control?',
      choices: ['Network bandwidth', 'Access and permissions', 'Database backups'],
      correctIndex: 1,
    },
  },
  {
    id: 'kms',
    name: 'KMS',
    category: 'security',
    fact: 'KMS lets you create and manage encryption keys used to protect your data across AWS services.',
    overview:
      'AWS KMS (Key Management Service) lets you create, store, and control encryption keys used to protect data across AWS services, without you having to build your own key infrastructure.',
    analogy:
      'KMS is like a bank\'s safety deposit vault that holds the master keys — other services borrow a key from the vault to lock or unlock something, but the vault itself keeps tight control over who can request a key.',
    practicalUse:
      'A healthcare application storing sensitive patient records in S3 might use KMS to encrypt that data, ensuring only authorized services and users can decrypt it.',
    quiz: {
      question: 'What is AWS KMS used for?',
      choices: [
        'Creating and managing encryption keys',
        'Load balancing traffic',
        'Hosting virtual machines',
        'Running batch jobs',
      ],
      correctIndex: 0,
    },
    laneQuiz: {
      question: 'What is KMS used for?',
      choices: ['Managing encryption keys', 'Load balancing', 'Hosting VMs'],
      correctIndex: 0,
    },
  },
  {
    id: 'apigateway',
    name: 'API Gateway',
    category: 'integration',
    fact: 'API Gateway is the front door for your APIs — it handles requests and routes them to backends like Lambda.',
    overview:
      'Amazon API Gateway is a managed service that acts as the front door for your APIs, handling request routing, authentication, throttling, and monitoring before forwarding requests to backends like Lambda.',
    analogy:
      'API Gateway is like the receptionist at an office building — every visitor checks in at the front desk first, gets directed to the right department, and the receptionist can turn away anyone who is not allowed in.',
    practicalUse:
      'A mobile app backend might expose its features through API Gateway, which routes each incoming request to the right Lambda function based on the URL path.',
    quiz: {
      question: 'What role does API Gateway play in a serverless app?',
      choices: [
        'It stores files',
        'It acts as the entry point that routes API requests to backends',
        'It manages user identities',
        'It runs virtual machines',
      ],
      correctIndex: 1,
    },
    laneQuiz: {
      question: 'What does API Gateway do?',
      choices: ['Stores files', 'Routes API requests to backends', 'Runs virtual machines'],
      correctIndex: 1,
    },
  },
  {
    id: 'stepfunctions',
    name: 'Step Functions',
    category: 'integration',
    fact: 'Step Functions lets you coordinate multiple Lambda functions and services into a visual workflow.',
    overview:
      'AWS Step Functions lets you coordinate multiple AWS services, such as several Lambda functions, into a single visual workflow with defined steps, retries, and error handling.',
    analogy:
      'Step Functions is like a flowchart come to life — it walks a task through each step in order, automatically retrying a step that fails or branching to a different path depending on the result.',
    practicalUse:
      'An order processing system might use Step Functions to coordinate steps like charging a payment, updating inventory, and sending a confirmation email, retrying automatically if the payment step temporarily fails.',
    quiz: {
      question: 'What is AWS Step Functions used for?',
      choices: [
        'Storing large datasets',
        'Orchestrating multi-step workflows across services',
        'Managing DNS records',
        'Encrypting network traffic',
      ],
      correctIndex: 1,
    },
    laneQuiz: {
      question: 'What is Step Functions used for?',
      choices: ['Storing datasets', 'Orchestrating workflows', 'Managing DNS'],
      correctIndex: 1,
    },
  },
];

export function getServiceById(id) {
  return SERVICES.find((s) => s.id === id);
}

export function getRandomService() {
  return SERVICES[Math.floor(Math.random() * SERVICES.length)];
}

// Offline-only fallback progression of incremental notes for a service,
// used when /orb-note is unreachable. The AI-generated note (built fresh
// each collection via fetchOrbNote) is the primary path; this just reuses
// the static fact/overview/analogy/practicalUse fields — normally reserved
// for the end-of-run recap — as a degraded resilience path so the game
// still works offline. `priorCount` is how many notes have already been
// unlocked for this service this run, so repeated collections advance
// through the list instead of repeating the same note.
export function getStaticNoteFallback(service, priorCount) {
  const progression = [service.fact, service.overview, service.analogy, service.practicalUse].filter(Boolean);
  if (progression.length === 0) return null;
  const index = Math.min(priorCount, progression.length - 1);
  return progression[index];
}
