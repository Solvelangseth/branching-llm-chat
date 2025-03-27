import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selection, setSelection] = useState(null)
  const [conversations, setConversations] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [branches, setBranches] = useState({})
  const [debugChain, setDebugChain] = useState([])

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations()
  }, [])

  // Fetch messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      fetchMessages(currentConversationId)
    }
  }, [currentConversationId])

  const fetchConversations = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/conversations')
      const data = await response.json()
      setConversations(data)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    }
  }

  const fetchMessages = async (conversationId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/conversations/${conversationId}/messages`)
      const data = await response.json()
      setChatHistory(data)
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }

  const handleNewChat = () => {
    setCurrentConversationId(null)
    setChatHistory([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Add user message to chat history
    const userMessage = { role: 'user', content: message }
    setChatHistory(prev => [...prev, userMessage])
    setMessage('') // Clear input

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      const data = await res.json()
      // Add assistant response to chat history
      const assistantMessage = { role: 'assistant', content: data.reply }
      setChatHistory(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error:', error)
      setChatHistory(prev => [...prev, { role: 'error', content: 'Error: Could not connect to server' }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleTextSelection = (messageId, role) => {
    const selectedText = window.getSelection().toString()
    if (selectedText && role === 'assistant') {
      const selection = window.getSelection()
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      
      setSelection({
        text: selectedText,
        messageId: messageId,
        position: {
          top: rect.top - 40,
          left: rect.left + (rect.width / 2)
        }
      })
    } else {
      setSelection(null)
    }
  }

  const handleCreateBranch = async () => {
    if (!selection) return;

    try {
      const response = await fetch('http://localhost:3001/api/branch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: selection.messageId,
          selectedText: selection.text,
          conversationId: currentConversationId
        }),
      });

      const data = await response.json();
      
      // Update the conversations list
      fetchConversations();
      
      // Switch to the new conversation
      setCurrentConversationId(data.conversationId);
      
      // Clear the selection
      setSelection(null);
      
      // Set initial chat history for the new branch
      setChatHistory([{
        role: 'system',
        content: `Branching from: "${selection.text}"`
      }]);

    } catch (error) {
      console.error('Error creating branch:', error);
    }
  };

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button 
            className="new-chat-button"
            onClick={handleNewChat}
          >
            + New chat
          </button>
          <button 
            className="toggle-sidebar-button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        <div className="conversations-list">
          {conversations.map((conv) => (
            <div 
              key={conv.id}
              className={`conversation-item ${conv.id === currentConversationId ? 'active' : ''}`}
              onClick={() => setCurrentConversationId(conv.id)}
            >
              <div className="conversation-title">
                {`Chat ${conv.id}`}
              </div>
              <div className="conversation-date">
                {new Date(conv.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`main-content ${sidebarOpen ? 'with-sidebar' : 'full-width'}`}>
        <div className="chat-container">
          <h1>Branching LLM Chat</h1>
          
          <div className="messages-container">
            {chatHistory.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.role} ${branches[msg.id] ? 'has-branches' : ''}`}
                onMouseUp={() => handleTextSelection(msg.id, msg.role)}
              >
                <div className="message-header">
                  <strong>{msg.role === 'user' ? 'You' : 'Assistant'}</strong>
                  {branches[msg.id] && (
                    <div className="branch-indicator">
                      {branches[msg.id].length} branch{branches[msg.id].length !== 1 ? 'es' : ''}
                    </div>
                  )}
                </div>
                <p>{msg.content}</p>
              </div>
            ))}

            {/* Selection Popup */}
            {selection && (
              <div 
                className="branch-popup"
                style={{
                  position: 'fixed',
                  top: `${selection.position.top}px`,
                  left: `${selection.position.left}px`,
                }}
              >
                <button onClick={handleCreateBranch}>
                  Branch from selection
                </button>
              </div>
            )}
          </div>

          {/* Debug Panel */}
          {debugChain.length > 0 && (
            <div className="debug-panel">
              <h3>Working Memory Chain</h3>
              <div className="chain-visualization">
                {debugChain.map((msg, index) => (
                  <div key={index} className="chain-item">
                    <div className="chain-arrow">{index > 0 ? '↓' : ''}</div>
                    <div className="chain-message">
                      <strong>{msg.role}:</strong> {msg.content.substring(0, 50)}...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="chat-form">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !message}>
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
