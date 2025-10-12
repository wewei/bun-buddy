# Agent OS - Memory

## Overview

The **Memory** module is the semantic knowledge layer of Agent OS. While Ledger stores complete task execution history, Memory extracts knowledge and builds semantic indexes for intelligent retrieval and discovery.

Memory sits **below the Agent Bus**: it registers abilities for semantic search, knowledge graph traversal, and task archiving while reading from Ledger for complete task records.

### Key Characteristics

**Semantic Layer**: Memory operates at a higher abstraction level than Ledger, focusing on meaning and relationships rather than raw records.

**Optional Enhancement**: Memory is not required for Agent OS to function. Agent can operate with Ledger alone for basic persistence and recovery.

**Dual Storage**: 
- **Chroma**: Vector database for semantic similarity search
- **Neo4j**: Graph database for knowledge relationships

**Knowledge Extraction**: Uses LLM to extract concepts, facts, and procedures from complete task conversations stored in Ledger.

## Architecture

```
┌──────────────────────────────────────────────┐
│            Agent Bus                         │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│          Memory Module                       │
│                                              │
│  ┌────────────────┐    ┌─────────────────┐  │
│  │  Chroma        │    │  Neo4j          │  │
│  │  (Vectors)     │    │  (Graph)        │  │
│  └────────────────┘    └─────────────────┘  │
│                                              │
│  Abilities:                                  │
│  • mem:retrieve  - Semantic search          │
│  • mem:graph     - Knowledge traversal      │
│  • mem:archive   - Extract & index          │
│  • mem:related   - Find related tasks       │
└──────────────┬───────────────────────────────┘
               │ Read tasks
               ▼
┌──────────────────────────────────────────────┐
│          Ledger (SQLite)                     │
│  • Task records                              │
│  • Call history                              │
│  • Message logs                              │
└──────────────────────────────────────────────┘
```

## Core Concepts

### Knowledge Node

A knowledge node represents a discrete unit of extracted knowledge:

```typescript
type KnowledgeNode = {
  id: string;                    // Unique node identifier
  type: KnowledgeNodeType;       // Node category
  content: string;               // Text content
  embedding: number[];           // Vector representation
  
  source: {
    taskId: string;              // Ledger task ID
    timestamp: number;           // When extracted
  };
  
  metadata: {
    extractedBy: string;         // 'llm' or 'rule'
    confidence?: number;         // 0-1, extraction confidence
  };
};

type KnowledgeNodeType = 
  | 'concept'                    // Abstract concept (e.g., "regression analysis")
  | 'fact'                       // Concrete fact (e.g., "Q1 sales were $1.2M")
  | 'procedure'                  // How-to knowledge (e.g., "steps to clean data")
  | 'question'                   // User question
  | 'answer';                    // Assistant answer
```

### Knowledge Edge

A knowledge edge represents a relationship between nodes:

```typescript
type KnowledgeEdge = {
  id: string;                    // Unique edge identifier
  type: KnowledgeEdgeType;       // Relationship type
  from: string;                  // Source node ID
  to: string;                    // Target node ID
  weight: number;                // 0-1, relationship strength
  
  metadata?: {
    createdBy: string;           // How edge was created
    reason?: string;             // Why relationship exists
  };
};

type KnowledgeEdgeType = 
  | 'related_to'                 // General semantic relation
  | 'followed_by'                // Temporal/causal sequence
  | 'contradicts'                // Conflicting information
  | 'derived_from'               // Logical derivation
  | 'part_of'                    // Hierarchical containment
  | 'answered_by';               // Question-answer link
```

### Knowledge Graph Structure

```
┌─────────────┐
│  Concept    │──related_to──┐
│ "Sales      │              │
│  Analysis"  │              ▼
└──────┬──────┘        ┌──────────┐
       │               │  Fact    │
       │ part_of       │ "Q1: $1M"│
       │               └──────────┘
       ▼                     ▲
┌──────────────┐             │
│  Procedure   │─derived_from┘
│ "Calculate   │
│  Growth"     │
└──────────────┘
```

## Registered Abilities

### mem:archive

**Description**: Archive a completed task from Ledger into Memory's knowledge graph.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Ledger task ID to archive"
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

const { nodesCreated, edgesCreated } = JSON.parse(result);
console.log(`Extracted ${nodesCreated} nodes, ${edgesCreated} edges`);
```

**Process**:
1. Load task from Ledger (via `ldg:task:get`)
2. Load all messages (via `ldg:msg:list`)
3. Use LLM to extract knowledge nodes and relationships
4. Generate embeddings for each node
5. Store nodes in Chroma and Neo4j
6. Create edges in Neo4j

### mem:retrieve

**Description**: Semantic search for relevant knowledge using vector similarity.

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
      "description": "Maximum results",
      "default": 5
    },
    "minRelevance": {
      "type": "number",
      "description": "Minimum relevance score (0-1)",
      "default": 0.7
    },
    "nodeTypes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter by node types"
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
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "content": { "type": "string" },
          "type": { "type": "string" },
          "relevance": { "type": "number" },
          "source": {
            "type": "object",
            "properties": {
              "taskId": { "type": "string" }
            }
          }
        }
      }
    }
  },
  "required": ["nodes"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:retrieve')(JSON.stringify({
  query: 'How to calculate sales growth?',
  limit: 5,
  nodeTypes: ['procedure', 'concept']
}));

const { nodes } = JSON.parse(result);
for (const node of nodes) {
  console.log(`[${node.relevance.toFixed(2)}] ${node.content}`);
}
```

### mem:graph

**Description**: Traverse knowledge graph starting from specific nodes.

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
      "description": "Traversal strategy",
      "default": "bfs"
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
      "items": { "type": "object" }
    },
    "edges": {
      "type": "array",
      "items": { "type": "object" }
    }
  },
  "required": ["nodes", "edges"]
}
```

**Example**:
```typescript
// First, find relevant nodes
const retrieveResult = await bus.invoke('mem:retrieve')(JSON.stringify({
  query: 'sales analysis methods'
}));

const startNodeIds = JSON.parse(retrieveResult).nodes.map(n => n.id);

// Then traverse graph from those nodes
const graphResult = await bus.invoke('mem:graph')(JSON.stringify({
  startNodeIds,
  maxDepth: 2
}));

const { nodes, edges } = JSON.parse(graphResult);
console.log(`Found ${nodes.length} related knowledge nodes`);
```

### mem:related

**Description**: Find tasks related to a given task by semantic similarity and graph proximity.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Reference task ID"
    },
    "limit": {
      "type": "number",
      "default": 5
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
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "taskId": { "type": "string" },
          "similarity": { "type": "number" },
          "sharedNodes": { "type": "number" }
        }
      }
    }
  },
  "required": ["tasks"]
}
```

**Example**:
```typescript
const result = await bus.invoke('mem:related')(JSON.stringify({
  taskId: 'task-abc123',
  limit: 5
}));

const { tasks } = JSON.parse(result);
for (const task of tasks) {
  console.log(`Task ${task.taskId}: ${task.similarity.toFixed(2)} similarity`);
}
```

## Integration with Ledger

Memory reads from Ledger to access complete task records:

### Reading Tasks

```typescript
const loadTaskFromLedger = async (
  taskId: string,
  bus: AgentBus
): Promise<{ task: Task; messages: Message[] }> => {
  // Get task
  const taskResult = await bus.invoke('ldg:task:get')(
    JSON.stringify({ taskId })
  );
  const { task } = JSON.parse(taskResult);
  
  // Get messages
  const msgResult = await bus.invoke('ldg:msg:list')(
    JSON.stringify({ taskId })
  );
  const { messages } = JSON.parse(msgResult);
  
  return { task, messages };
};
```

### Archiving Trigger

Tasks are typically archived to Memory when they complete:

```typescript
// In Task Manager, when task completes:
const completeTask = async (
  taskId: string,
  bus: AgentBus
): Promise<void> => {
  // Update task status in Ledger
  const task = await loadTask(taskId, bus);
  task.completionStatus = 'success';
  task.updatedAt = Date.now();
  await bus.invoke('ldg:task:save')(JSON.stringify({ task }));
  
  // Archive to Memory (async, non-blocking)
  bus.invoke('mem:archive')(JSON.stringify({ taskId }))
    .catch(err => console.error('Archive failed:', err));
};
```

## Knowledge Extraction

### Extraction Process

```typescript
const extractKnowledge = async (
  taskId: string,
  bus: AgentBus
): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> => {
  // 1. Load task from Ledger
  const { task, messages } = await loadTaskFromLedger(taskId, bus);
  
  // 2. Build extraction prompt
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
          goal: task.systemPrompt,
          conversation: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      }
    ]
  };
  
  // 3. Call LLM for extraction
  const llmResult = await bus.invoke('model:llm')(
    JSON.stringify(extractionPrompt)
  );
  
  const extraction = JSON.parse(llmResult);
  
  // 4. Generate embeddings for nodes
  const nodes: KnowledgeNode[] = await Promise.all(
    extraction.nodes.map(async (nodeData: any) => {
      const embedResult = await bus.invoke('model:embed')(
        JSON.stringify({ text: nodeData.content })
      );
      const { embedding } = JSON.parse(embedResult);
      
      return {
        id: generateId(),
        type: nodeData.type,
        content: nodeData.content,
        embedding,
        source: {
          taskId: task.id,
          timestamp: task.updatedAt
        },
        metadata: {
          extractedBy: 'llm',
          confidence: nodeData.confidence || 0.8
        }
      };
    })
  );
  
  // 5. Create edges
  const edges: KnowledgeEdge[] = extraction.edges.map((edgeData: any) => ({
    id: generateId(),
    type: edgeData.type,
    from: findNodeId(edgeData.from, nodes),
    to: findNodeId(edgeData.to, nodes),
    weight: edgeData.weight || 1.0,
    metadata: {
      createdBy: 'llm',
      reason: edgeData.reason
    }
  }));
  
  return { nodes, edges };
};
```

### Prompt Design

The extraction prompt should guide the LLM to:
- Identify key concepts discussed
- Extract concrete facts and data points
- Recognize procedural knowledge (how-to steps)
- Detect questions and their answers
- Establish relationships between knowledge units

Example extraction output:

```json
{
  "nodes": [
    {
      "type": "concept",
      "content": "Sales growth analysis",
      "confidence": 0.9
    },
    {
      "type": "fact",
      "content": "Q1 2024 sales were $1.2M",
      "confidence": 1.0
    },
    {
      "type": "procedure",
      "content": "Calculate growth: (current - previous) / previous * 100",
      "confidence": 0.95
    }
  ],
  "edges": [
    {
      "type": "part_of",
      "from": "Q1 2024 sales were $1.2M",
      "to": "Sales growth analysis",
      "weight": 0.8
    },
    {
      "type": "derived_from",
      "from": "Calculate growth: (current - previous) / previous * 100",
      "to": "Sales growth analysis",
      "weight": 0.9
    }
  ]
}
```

## Vector Store (Chroma)

### Storage

```typescript
import { ChromaClient } from 'chromadb';

type VectorStore = {
  client: ChromaClient;
  collection: string;
};

const createVectorStore = async (): Promise<VectorStore> => {
  const client = new ChromaClient({
    path: process.env.CHROMA_ENDPOINT || 'http://localhost:8000'
  });
  
  await client.getOrCreateCollection({
    name: 'agent-os-knowledge',
    metadata: { description: 'Agent OS knowledge base' }
  });
  
  return { client, collection: 'agent-os-knowledge' };
};
```

### Adding Nodes

```typescript
const addNodesToChroma = async (
  nodes: KnowledgeNode[],
  store: VectorStore
): Promise<void> => {
  const collection = await store.client.getCollection({
    name: store.collection
  });
  
  await collection.add({
    ids: nodes.map(n => n.id),
    embeddings: nodes.map(n => n.embedding),
    documents: nodes.map(n => n.content),
    metadatas: nodes.map(n => ({
      type: n.type,
      taskId: n.source.taskId,
      timestamp: n.source.timestamp,
      confidence: n.metadata.confidence || 0.8
    }))
  });
};
```

### Semantic Search

```typescript
const semanticSearch = async (
  query: string,
  limit: number,
  store: VectorStore,
  bus: AgentBus
): Promise<KnowledgeNode[]> => {
  // Generate query embedding
  const embedResult = await bus.invoke('model:embed')(
    JSON.stringify({ text: query })
  );
  const { embedding } = JSON.parse(embedResult);
  
  // Search Chroma
  const collection = await store.client.getCollection({
    name: store.collection
  });
  
  const results = await collection.query({
    queryEmbeddings: [embedding],
    nResults: limit
  });
  
  // Convert to KnowledgeNode format
  return results.ids[0].map((id, i) => ({
    id,
    type: results.metadatas![0][i].type as KnowledgeNodeType,
    content: results.documents![0][i],
    embedding,
    source: {
      taskId: results.metadatas![0][i].taskId as string,
      timestamp: results.metadatas![0][i].timestamp as number
    },
    metadata: {
      extractedBy: 'llm',
      confidence: 1 - (results.distances![0][i] || 0)
    }
  }));
};
```

## Graph Store (Neo4j)

### Storage

```typescript
import neo4j from 'neo4j-driver';

type GraphStore = {
  driver: neo4j.Driver;
};

const createGraphStore = (): GraphStore => {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );
  
  return { driver };
};
```

### Adding Nodes and Edges

```typescript
const addNodesToNeo4j = async (
  nodes: KnowledgeNode[],
  store: GraphStore
): Promise<void> => {
  const session = store.driver.session();
  
  try {
    for (const node of nodes) {
      await session.run(
        `CREATE (n:KnowledgeNode {
          id: $id,
          type: $type,
          content: $content,
          taskId: $taskId,
          timestamp: $timestamp
        })`,
        {
          id: node.id,
          type: node.type,
          content: node.content,
          taskId: node.source.taskId,
          timestamp: node.source.timestamp
        }
      );
    }
  } finally {
    await session.close();
  }
};

const addEdgesToNeo4j = async (
  edges: KnowledgeEdge[],
  store: GraphStore
): Promise<void> => {
  const session = store.driver.session();
  
  try {
    for (const edge of edges) {
      await session.run(
        `MATCH (a:KnowledgeNode {id: $fromId})
         MATCH (b:KnowledgeNode {id: $toId})
         CREATE (a)-[r:${edge.type.toUpperCase()} {weight: $weight}]->(b)`,
        {
          fromId: edge.from,
          toId: edge.to,
          weight: edge.weight
        }
      );
    }
  } finally {
    await session.close();
  }
};
```

### Graph Traversal

```typescript
const traverseGraph = async (
  startNodeIds: string[],
  maxDepth: number,
  store: GraphStore
): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> => {
  const session = store.driver.session();
  
  try {
    const result = await session.run(
      `MATCH path = (start:KnowledgeNode)-[*1..${maxDepth}]-(connected)
       WHERE start.id IN $startIds
       RETURN nodes(path) as nodes, relationships(path) as edges`,
      { startIds: startNodeIds }
    );
    
    // Process results into nodes and edges
    const nodesMap = new Map<string, KnowledgeNode>();
    const edgesMap = new Map<string, KnowledgeEdge>();
    
    for (const record of result.records) {
      const pathNodes = record.get('nodes');
      const pathEdges = record.get('edges');
      
      // Extract nodes
      for (const node of pathNodes) {
        if (!nodesMap.has(node.properties.id)) {
          nodesMap.set(node.properties.id, {
            id: node.properties.id,
            type: node.properties.type,
            content: node.properties.content,
            embedding: [],
            source: {
              taskId: node.properties.taskId,
              timestamp: node.properties.timestamp
            },
            metadata: { extractedBy: 'llm' }
          });
        }
      }
      
      // Extract edges
      for (const edge of pathEdges) {
        const edgeId = `${edge.start}-${edge.type}-${edge.end}`;
        if (!edgesMap.has(edgeId)) {
          edgesMap.set(edgeId, {
            id: edgeId,
            type: edge.type.toLowerCase(),
            from: edge.start.toString(),
            to: edge.end.toString(),
            weight: edge.properties.weight || 1.0
          });
        }
      }
    }
    
    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values())
    };
  } finally {
    await session.close();
  }
};
```

## Testing Strategy

### Unit Tests

```typescript
test('mem:archive extracts knowledge from task', async () => {
  const bus = createMockBus();
  const memory = createMemory(bus);
  
  // Mock Ledger responses
  bus.mockAbility('ldg:task:get', async () => JSON.stringify({
    task: { id: 'task-test', /* ... */ }
  }));
  
  bus.mockAbility('ldg:msg:list', async () => JSON.stringify({
    messages: [/* ... */]
  }));
  
  // Archive task
  const result = await bus.invoke('mem:archive')(JSON.stringify({
    taskId: 'task-test'
  }));
  
  const { nodesCreated, edgesCreated } = JSON.parse(result);
  expect(nodesCreated).toBeGreaterThan(0);
  expect(edgesCreated).toBeGreaterThan(0);
});

test('mem:retrieve finds semantically similar content', async () => {
  const bus = createAgentBus();
  const memory = createMemory(bus);
  
  // Add some knowledge nodes
  await archiveTestTask(bus);
  
  // Query for related content
  const result = await bus.invoke('mem:retrieve')(JSON.stringify({
    query: 'How to analyze sales?',
    limit: 3
  }));
  
  const { nodes } = JSON.parse(result);
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes[0].relevance).toBeGreaterThan(0.7);
});
```

### Integration Tests

```typescript
test('Full archiving flow from Ledger to Memory', async () => {
  const bus = createAgentBus();
  const ledger = createLedger(bus);
  const memory = createMemory(bus);
  
  // Create and complete task in Ledger
  const taskId = await createTestTask(bus);
  await completeTestTask(taskId, bus);
  
  // Archive to Memory
  await bus.invoke('mem:archive')(JSON.stringify({ taskId }));
  
  // Verify in Chroma
  const retrieveResult = await bus.invoke('mem:retrieve')(JSON.stringify({
    query: 'test task content'
  }));
  
  const { nodes } = JSON.parse(retrieveResult);
  expect(nodes.some(n => n.source.taskId === taskId)).toBe(true);
  
  // Verify in Neo4j
  const graphResult = await bus.invoke('mem:graph')(JSON.stringify({
    startNodeIds: [nodes[0].id],
    maxDepth: 1
  }));
  
  const { edges } = JSON.parse(graphResult);
  expect(edges.length).toBeGreaterThan(0);
});
```

## Performance Considerations

### Lazy Archiving

Archive tasks asynchronously to avoid blocking task completion:

```typescript
// Non-blocking archive
bus.invoke('mem:archive')(JSON.stringify({ taskId }))
  .catch(err => console.error('Archive failed:', err));
```

### Batch Processing

Archive multiple tasks in batches:

```typescript
const batchArchive = async (
  taskIds: string[],
  bus: AgentBus
): Promise<void> => {
  await Promise.all(
    taskIds.map(id => 
      bus.invoke('mem:archive')(JSON.stringify({ taskId: id }))
    )
  );
};
```

### Index Optimization

- **Chroma**: Use appropriate distance metrics (cosine similarity for text)
- **Neo4j**: Create indexes on frequently queried properties
- **Caching**: Cache frequently accessed knowledge nodes

## Summary

Memory provides:

✅ **Semantic knowledge extraction** from complete task history  
✅ **Vector similarity search** for intelligent retrieval  
✅ **Knowledge graph traversal** for relationship discovery  
✅ **Optional enhancement layer** that doesn't block core Agent functionality  
✅ **Dual storage strategy** combining vectors and graphs  
✅ **LLM-powered extraction** for automatic knowledge discovery  
✅ **Integration with Ledger** for complete task access

As the intelligence layer above Ledger, Memory enables Agent OS to learn from experience and provide contextually relevant responses based on accumulated knowledge.
