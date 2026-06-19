use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Effort {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub kind: String, // "text" | "thinking"
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallDef {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String, // "function"
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String, // JSON serializado
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultContent {
    pub tool_call_id: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum ChatMessage {
    #[serde(rename = "user")]
    User { content: Vec<ContentBlock> },
    #[serde(rename = "assistant")]
    Assistant {
        content: Vec<ContentBlock>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_calls: Option<Vec<ToolCallDef>>,
    },
    #[serde(rename = "tool")]
    Tool {
        tool_call_id: String,
        content: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub effort: Effort,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<serde_json::Value>,
    pub system: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone)]
pub enum LlmEvent {
    Token(String),
    Thinking(String),
    ToolCall(ToolCall),
    Done(Usage),
}
