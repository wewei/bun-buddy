# Agent OS - Memory Module

## Overview

The **Memory** module is the persistent storage layer of Agent OS. Like an operating system's file system and database, Memory provides both **complete record storage** (lower layer) and **semantic indexing** (upper layer) for intelligent retrieval.

Memory sits **below the Agent Bus**: it registers abilities for saving, querying, and retrieving information while integrating with external storage systems (file system, Chroma, Neo4j).

## Core Concepts

### Dual-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│              Upper Layer (Semantic)             │
│                                                 │
│  ┌──────────────┐         ┌─────────────────┐  │
│  │   Chroma     │         │     Neo4j       │  │
│  │  (Vectors)   │         │  (Graph DB)     │  │
│  └──────────────┘         └─────────────────┘  │
│                                                 │
│  • Vector similarity search                    │
│  • Knowledge graph traversal                   │
│  • Semantic clustering                         │
└─────────────────────────────────────────────────┘
                      ▲
                      │ References via taskId
                      ▼
┌─────────────────────────────────────────────────┐
│             Lower Layer (Complete)              │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      File System Storage                 │  │
│  │  ~/.agent-os/tasks/                      │  │
│  │    ├── task-abc123.json                  │  │
│  │    ├── task-xyz789.json                  │  │
│  │    └── ...                               │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  • Complete task records                       │
│  • Full message history                        │
│  • Audit trail                                 │
└─────────────────────────────────────────────────┘
```

### Lower Layer - Complete Records

**Purpose**: Store complete, unmodified task records for auditing and reconstruction.

**Storage**: File system (JSON files)

**Key Feature**: Every task is saved in its entirety, including all messages, tool calls, and metadata.

### Upper Layer - Semantic Index

**Purpose**: Enable intelligent retrieval through vector similarity and graph relationships.

**Storage**: 
- **Chroma**: Vector database for semantic similarity search
- **Neo4j**: Graph database for knowledge relationships

**Key Feature**: Extracts knowledge from tasks and builds a queryable knowledge graph.

## Registered Abilities

### mem:save

**Description**: Save a complete task record to lower layer storage.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": "object",
      "description": "Complete task object to save"
    }
  },
  "required": ["task"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "taskId": { "type": "string" },
    "path": { "type": "string", "description": "File path where task was saved" }
  },
  "required": ["success", "taskId"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:save')(JSON.stringify({
  task: {
    id: 'task-abc123',
    goal: 'Analyze sales data',
    status: 'completed',
    context: [ /* messages */ ],
    createdAt: Date.now(),
    completedAt: Date.now()
  }
}));

// { "success": true, "taskId": "task-abc123", "path": "~/.agent-os/tasks/task-abc123.json" }
```

### mem:query

**Description**: Query historical tasks by filters (lower layer).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["pending", "running", "waiting", "completed", "failed", "killed"]
    },
    "fromDate": {
      "type": "number",
      "description": "Start timestamp (Unix ms)"
    },
    "toDate": {
      "type": "number",
      "description": "End timestamp (Unix ms)"
    },
    "limit": {
      "type": "number",
      "description": "Maximum results to return"
    },
    "offset": {
      "type": "number",
      "description": "Pagination offset"
    }
  }
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "description": "Task summary (not full context)"
      }
    },
    "total": {
      "type": "number",
      "description": "Total matching tasks"
    },
    "hasMore": {
      "type": "boolean"
    }
  },
  "required": ["tasks", "total", "hasMore"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:query')(JSON.stringify({
  status: 'completed',
  fromDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
  limit: 10
}));

const { tasks, total } = JSON.parse(result);
console.log(`Found ${total} completed tasks in the last week`);
```

### mem:retrieve

**Description**: Semantic retrieval using vector similarity (upper layer).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language query"
    },
    "limit": {
      "type": "number",
      "description": "Maximum results to return",
      "default": 5
    },
    "minRelevance": {
      "type": "number",
      "description": "Minimum relevance score (0-1)",
      "default": 0.7
    }
  },
  "required": ["query"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "chunks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "content": { "type": "string" },
          "relevance": { "type": "number" },
          "source": {
            "type": "object",
            "properties": {
              "taskId": { "type": "string" },
              "timestamp": { "type": "number" }
            }
          }
        }
      }
    }
  },
  "required": ["chunks"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:retrieve')(JSON.stringify({
  query: 'How did we analyze Q1 sales?',
  limit: 5
}));

const { chunks } = JSON.parse(result);
chunks.forEach(chunk => {
  console.log(`[${chunk.relevance.toFixed(2)}] ${chunk.content}`);
  console.log(`  Source: task ${chunk.source.taskId}\n`);
});
```

### mem:archive

**Description**: Archive a task to the upper layer (extract knowledge and build graph).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Task to archive"
    }
  },
  "required": ["taskId"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "nodesCreated": { "type": "number" },
    "edgesCreated": { "type": "number" }
  },
  "required": ["success", "nodesCreated", "edgesCreated"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:archive')(JSON.stringify({
  taskId: 'task-abc123'
}));

// { "success": true, "nodesCreated": 12, "edgesCreated": 18 }
```

**Process**:
1. Load task from lower layer
2. Use LLM to extract knowledge nodes (concepts, facts, procedures)
3. Generate embeddings for each node
4. Identify relationships between nodes
5. Store nodes in Chroma + Neo4j

### mem:graph

**Description**: Traverse the knowledge graph starting from specific nodes.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "startNodeIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Starting node IDs"
    },
    "strategy": {
      "type": "string",
      "enum": ["bfs", "dfs"],
      "description": "Traversal strategy"
    },
    "maxDepth": {
      "type": "number",
      "description": "Maximum traversal depth",
      "default": 3
    },
    "edgeTypes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter by edge types"
    }
  },
  "required": ["startNodeIds"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "content": { "type": "string" },
          "source": {
            "type": "object",
            "properties": {
              "taskId": { "type": "string" }
            }
          }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "type": { "type": "string" },
          "weight": { "type": "number" }
        }
      }
    }
  },
  "required": ["nodes", "edges"]
}
```

**Example**:
```typescript
// First, retrieve relevant starting points
const retrieveResult = await bus.invoke('mem:retrieve')(JSON.stringify({
  query: 'sales analysis methods'
}));

const startNodeIds = JSON.parse(retrieveResult).chunks.map(c => c.nodeId);

// Then traverse graph from those nodes
const graphResult = await bus.invoke('mem:graph')(JSON.stringify({
  startNodeIds,
  strategy: 'bfs',
  maxDepth: 2
}));

const { nodes, edges } = JSON.parse(graphResult);
console.log(`Found ${nodes.length} related knowledge nodes`);
```

## Knowledge Graph Structure

### Node Types

```typescript
type KnowledgeNodeType = 
  | 'concept'        // Abstract concept (e.g., "regression analysis")
  | 'fact'           // Concrete fact (e.g., "Q1 sales were $1.2M")
  | 'procedure'      // How-to knowledge (e.g., "steps to clean data")
  | 'question'       // User question
  | 'answer';        // Assistant answer

type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  content: string;                      // Text content
  embedding: number[];                  // Vector representation
  
  source: {
    taskId: string;
    timestamp: number;
  };
  
  metadata: {
    extractedBy: string;                // 'llm' or 'rule'
    confidence?: number;                // 0-1
  };
};
```

### Edge Types

```typescript
type KnowledgeEdgeType = 
  | 'related_to'      // General semantic relation
  | 'followed_by'     // Temporal/causal sequence
  | 'contradicts'     // Conflicting information
  | 'derived_from'    // Logical derivation
  | 'part_of'         // Hierarchical containment
  | 'answered_by';    // Question-answer link

type KnowledgeEdge = {
  id: string;
  type: KnowledgeEdgeType;
  from: string;                         // Source node ID
  to: string;                           // Target node ID
  weight: number;                       // 0-1, edge strength
  
  metadata?: {
    createdBy: string;
    reason?: string;
  };
};
```

## Storage Implementation

### Lower Layer - File System

```typescript
type LowerMemory = {
  storagePath: string;                  // Base directory
};

const createLowerMemory = (storagePath: string): LowerMemory => {
  // Ensure directory exists
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  
  return { storagePath };
};

// Save task
async function saveTask(lower: LowerMemory, task: Task): Promise<string> {
  const filePath = path.join(lower.storagePath, `${task.id}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(task, null, 2));
  return filePath;
}

// Load task
async function loadTask(lower: LowerMemory, taskId: string): Promise<Task | undefined> {
  const filePath = path.join(lower.storagePath, `${taskId}.json`);
  
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

// Query tasks
async function queryTasks(
  lower: LowerMemory,
  filter: { status?: string; fromDate?: number; toDate?: number; limit?: number }
): Promise<Task[]> {
  const files = await fs.promises.readdir(lower.storagePath);
  const tasks: Task[] = [];
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const taskId = file.replace('.json', '');
    const task = await loadTask(lower, taskId);
    
    if (!task) continue;
    
    // Apply filters
    if (filter.status && task.status !== filter.status) continue;
    if (filter.fromDate && task.createdAt < filter.fromDate) continue;
    if (filter.toDate && task.createdAt > filter.toDate) continue;
    
    tasks.push(task);
  }
  
  // Sort by createdAt descending
  tasks.sort((a, b) => b.createdAt - a.createdAt);
  
  // Apply limit
  return filter.limit ? tasks.slice(0, filter.limit) : tasks;
}
```

### Upper Layer - Chroma (Vector Store)

```typescript
import { ChromaClient } from 'chromadb';

type VectorStore = {
  client: ChromaClient;
  collection: string;
};

const createVectorStore = async (
  endpoint: string,
  collectionName: string
): Promise<VectorStore> => {
  const client = new ChromaClient({ path: endpoint });
  
  // Get or create collection
  await client.getOrCreateCollection({
    name: collectionName,
    metadata: { description: 'Agent OS knowledge base' }
  });
  
  return { client, collection: collectionName };
};

// Add knowledge node
async function addKnowledgeNode(
  store: VectorStore,
  node: KnowledgeNode,
  bus: AgentBus
): Promise<void> {
  const collection = await store.client.getCollection({ name: store.collection });
  
  // Generate embedding if not provided
  if (!node.embedding || node.embedding.length === 0) {
    const embedResult = await bus.invoke('model:embed')(JSON.stringify({
      text: node.content
    }));
    node.embedding = JSON.parse(embedResult).embedding;
  }
  
  // Add to Chroma
  await collection.add({
    ids: [node.id],
    embeddings: [node.embedding],
    documents: [node.content],
    metadatas: [{
      type: node.type,
      taskId: node.source.taskId,
      timestamp: node.source.timestamp
    }]
  });
}

// Vector similarity search
async function vectorSearch(
  store: VectorStore,
  queryEmbedding: number[],
  limit: number = 5
): Promise<KnowledgeNode[]> {
  const collection = await store.client.getCollection({ name: store.collection });
  
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit
  });
  
  // Convert to KnowledgeNode format
  return results.ids[0].map((id, i) => ({
    id,
    type: results.metadatas![0][i].type as KnowledgeNodeType,
    content: results.documents![0][i],
    embedding: queryEmbedding,
    source: {
      taskId: results.metadatas![0][i].taskId as string,
      timestamp: results.metadatas![0][i].timestamp as number
    },
    metadata: {
      extractedBy: 'llm',
      confidence: 1 - (results.distances![0][i] || 0)
    }
  }));
}
```

### Upper Layer - Neo4j (Graph Store)

```typescript
import neo4j from 'neo4j-driver';

type GraphStore = {
  driver: neo4j.Driver;
};

const createGraphStore = (
  endpoint: string,
  username: string,
  password: string
): GraphStore => {
  const driver = neo4j.driver(endpoint, neo4j.auth.basic(username, password));
  return { driver };
};

// Add knowledge edge
async function addKnowledgeEdge(
  store: GraphStore,
  edge: KnowledgeEdge
): Promise<void> {
  const session = store.driver.session();
  
  try {
    await session.run(
      `MATCH (a:KnowledgeNode {id: $fromId})
       MATCH (b:KnowledgeNode {id: $toId})
       CREATE (a)-[r:${edge.type.toUpperCase()} {weight: $weight}]->(b)
       RETURN r`,
      {
        fromId: edge.from,
        toId: edge.to,
        weight: edge.weight
      }
    );
  } finally {
    await session.close();
  }
}

// Graph traversal (BFS)
async function traverseGraph(
  store: GraphStore,
  startNodeIds: string[],
  maxDepth: number = 3
): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
  const session = store.driver.session();
  
  try {
    const result = await session.run(
      `MATCH path = (start:KnowledgeNode)-[*1..${maxDepth}]-(connected)
       WHERE start.id IN $startIds
       RETURN nodes(path) as nodes, relationships(path) as edges`,
      { startIds: startNodeIds }
    );
    
    // Process results...
    const nodes: KnowledgeNode[] = [];
    const edges: KnowledgeEdge[] = [];
    
    // Extract unique nodes and edges
    // ...
    
    return { nodes, edges };
  } finally {
    await session.close();
  }
}
```

## Archiving Process

When `mem:archive` is invoked, the following process extracts knowledge:

```typescript
async function archiveTask(taskId: string, bus: AgentBus): Promise<{ nodesCreated: number; edgesCreated: number }> {
  // 1. Load task from lower layer
  const task = await loadTask(lowerMemory, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  
  // 2. Use LLM to extract knowledge
  const extractionPrompt = {
    messages: [
      {
        role: 'system',
        content: `You are a knowledge extractor. Analyze the following task conversation
                  and extract key knowledge nodes (concepts, facts, procedures).
                  For each node, identify its type and relationships to other nodes.
                  Respond with JSON: { nodes: [...], edges: [...] }`
      },
      {
        role: 'user',
        content: JSON.stringify({
          goal: task.goal,
          messages: task.context
        })
      }
    ]
  };
  
  const llmStream = bus.invokeStream('model:llm')(JSON.stringify(extractionPrompt));
  
  let fullResponse = '';
  for await (const chunk of llmStream) {
    const data = JSON.parse(chunk);
    if (data.content) fullResponse += data.content;
  }
  
  const { nodes, edges } = JSON.parse(fullResponse);
  
  // 3. Add nodes to vector store
  for (const nodeData of nodes) {
    const node: KnowledgeNode = {
      id: generateId(),
      type: nodeData.type,
      content: nodeData.content,
      embedding: [],
      source: {
        taskId: task.id,
        timestamp: task.completedAt || task.updatedAt
      },
      metadata: { extractedBy: 'llm' }
    };
    
    await addKnowledgeNode(vectorStore, node, bus);
  }
  
  // 4. Add edges to graph store
  for (const edgeData of edges) {
    const edge: KnowledgeEdge = {
      id: generateId(),
      type: edgeData.type,
      from: edgeData.from,
      to: edgeData.to,
      weight: edgeData.weight || 1.0,
      metadata: { createdBy: 'llm' }
    };
    
    await addKnowledgeEdge(graphStore, edge);
  }
  
  return { nodesCreated: nodes.length, edgesCreated: edges.length };
}
```

## Memory Abilities Registration

```typescript
function registerMemoryAbilities(
  lowerMemory: LowerMemory,
  vectorStore: VectorStore,
  graphStore: GraphStore,
  bus: AgentBus
): void {
  // mem:save
  bus.register(
    {
      id: 'mem:save',
      moduleName: 'mem',
      abilityName: 'save',
      description: 'Save task to storage',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const { task } = JSON.parse(input);
      const path = await saveTask(lowerMemory, task);
      return JSON.stringify({ success: true, taskId: task.id, path });
    }
  );
  
  // mem:query
  bus.register(
    {
      id: 'mem:query',
      moduleName: 'mem',
      abilityName: 'query',
      description: 'Query historical tasks',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const filter = JSON.parse(input);
      const tasks = await queryTasks(lowerMemory, filter);
      return JSON.stringify({
        tasks: tasks.map(summarizeTask),
        total: tasks.length,
        hasMore: false
      });
    }
  );
  
  // mem:retrieve
  bus.register(
    {
      id: 'mem:retrieve',
      moduleName: 'mem',
      abilityName: 'retrieve',
      description: 'Semantic retrieval via vector similarity',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const { query, limit, minRelevance } = JSON.parse(input);
      
      // Generate query embedding
      const embedResult = await bus.invoke('model:embed')(JSON.stringify({ text: query }));
      const { embedding } = JSON.parse(embedResult);
      
      // Search
      const nodes = await vectorSearch(vectorStore, embedding, limit);
      
      // Filter by relevance
      const chunks = nodes
        .filter(n => n.metadata.confidence! >= (minRelevance || 0.7))
        .map(n => ({
          content: n.content,
          relevance: n.metadata.confidence!,
          source: n.source
        }));
      
      return JSON.stringify({ chunks });
    }
  );
  
  // mem:archive, mem:graph...
}
```

## Testing Strategy

```typescript
test('mem:save persists task to file system', async () => {
  const bus = createAgentBus();
  const memory = createMemory(bus, { storagePath: '/tmp/test-tasks' });
  
  const task = {
    id: 'task-test',
    goal: 'Test task',
    status: 'completed',
    context: [],
    createdAt: Date.now()
  };
  
  const result = await bus.invoke('mem:save')(JSON.stringify({ task }));
  const { success, path } = JSON.parse(result);
  
  expect(success).toBe(true);
  expect(fs.existsSync(path)).toBe(true);
});

test('mem:retrieve finds semantically similar content', async () => {
  const bus = createAgentBus();
  const memory = createMemory(bus, { /* ... */ });
  
  // Archive a task with known content
  await bus.invoke('mem:archive')(JSON.stringify({ taskId: 'task-with-sales-data' }));
  
  // Query for related content
  const result = await bus.invoke('mem:retrieve')(JSON.stringify({
    query: 'How do we analyze sales?',
    limit: 3
  }));
  
  const { chunks } = JSON.parse(result);
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks[0].relevance).toBeGreaterThan(0.7);
});
```

## Summary

The Memory module provides:

✅ **Dual-layer storage** - complete records + semantic index
✅ **Vector similarity search** via Chroma
✅ **Knowledge graph** via Neo4j
✅ **Automatic archiving** with LLM-based knowledge extraction
✅ **Graph traversal** for discovering related knowledge
✅ **Full audit trail** with complete task history

As the storage layer, Memory enables Agent OS to learn from past interactions and provide contextually relevant responses.

