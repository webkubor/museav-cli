export const CLI_CODE = `# 1. 安装 CLI
npm install -g modelgo-cli

# 2. 浏览器授权登录（无需手动复制 API Key）
modelgo-cli auth login

# 3. 在终端确认后即可直接调用
modelgo-cli run --model deepseek-chat "你好！"`

export const PLAIN_CODES = {
  python: `import openai

client = openai.OpenAI(
    api_key="your_modelgo_api_key",
    base_url="https://api.modelgo.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好！"}]
)

print(response.choices[0].message.content)`,
  node: `import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "your_modelgo_api_key",
  baseURL: "https://api.modelgo.com/v1"
});

const completion = await openai.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hello!" }]
});

console.log(completion.choices[0].message.content);`,
  curl: `curl https://api.modelgo.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_modelgo_api_key" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`
}
