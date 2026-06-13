import React from 'react'

interface CodeHighlightProps {
  language: 'cli' | 'python' | 'node' | 'curl'
}

export const CodeHighlight: React.FC<CodeHighlightProps> = ({ language }) => {
  return (
    <pre className="code-editor-pre">
      {language === 'cli' && (
        <code>
          <span className="code-comment"># 1. 安装 CLI</span><br />
          npx <span className="code-string">@model-go/cli@latest</span> install<br /><br />
          <span className="code-comment"># 2. 浏览器授权登录（无需手动复制 API Key）</span><br />
          modelgo auth <span className="code-builtin">login</span>
        </code>
      )}
      {language === 'python' && (
        <code>
          <span className="code-keyword">import</span> openai<br /><br />
          client = openai.<span className="code-builtin">OpenAI</span>(<br />
          &nbsp;&nbsp;&nbsp;&nbsp;api_key=<span className="code-string">"your_modelgo_api_key"</span>,<br />
          &nbsp;&nbsp;&nbsp;&nbsp;base_url=<span className="code-string">"https://api.modelgo.com/v1"</span><br />
          )<br /><br />
          response = client.chat.completions.create(<br />
          &nbsp;&nbsp;&nbsp;&nbsp;model=<span className="code-string">"deepseek-chat"</span>,<br />
          &nbsp;&nbsp;&nbsp;&nbsp;messages=[&#123;<span className="code-property">"role"</span>: <span className="code-string">"user"</span>, <span className="code-property">"content"</span>: <span className="code-string">"你好！"</span>&#125;]<br />
          )<br /><br />
          <span className="code-builtin">print</span>(response.choices[<span className="code-constant">0</span>].message.content)
        </code>
      )}
      {language === 'node' && (
        <code>
          <span className="code-keyword">import</span> <span className="code-builtin">OpenAI</span> <span className="code-keyword">from</span> <span className="code-string">"openai"</span>;<br /><br />
          <span className="code-keyword">const</span> openai = <span className="code-keyword">new</span> <span className="code-builtin">OpenAI</span>(&#123;<br />
          &nbsp;&nbsp;<span className="code-property">apiKey</span>: <span className="code-string">"your_modelgo_api_key"</span>,<br />
          &nbsp;&nbsp;<span className="code-property">baseURL</span>: <span className="code-string">"https://api.modelgo.com/v1"</span><br />
          &#125;);<br /><br />
          <span className="code-keyword">const</span> completion = <span className="code-keyword">await</span> openai.chat.completions.create(&#123;<br />
          &nbsp;&nbsp;<span className="code-property">model</span>: <span className="code-string">"deepseek-chat"</span>,<br />
          &nbsp;&nbsp;<span className="code-property">messages</span>: [&#123; <span className="code-property">role</span>: <span className="code-string">"user"</span>, <span className="code-property">content</span>: <span className="code-string">"Hello!"</span> &#125;]<br />
          &#125;);<br /><br />
          <span className="code-builtin">console</span>.log(completion.choices[<span className="code-constant">0</span>].message.content);
        </code>
      )}
      {language === 'curl' && (
        <code>
          curl https://api.modelgo.com/v1/chat/completions \<br />
          &nbsp;&nbsp;-H <span className="code-string">"Content-Type: application/json"</span> \<br />
          &nbsp;&nbsp;-H <span className="code-string">"Authorization: Bearer your_modelgo_api_key"</span> \<br />
          &nbsp;&nbsp;-d <span className="code-string">'&#123;<br />
          &nbsp;&nbsp;&nbsp;&nbsp;"model": "deepseek-chat",<br />
          &nbsp;&nbsp;&nbsp;&nbsp;"messages": [&#123;"role": "user", "content": "Hello!"&#125;]<br />
          &nbsp;&nbsp;&#125;'</span>
        </code>
      )}
    </pre>
  )
}
