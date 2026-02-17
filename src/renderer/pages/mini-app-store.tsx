import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Plus, Check, Trash2 } from 'lucide-react'
import { CategoryIcon } from '../components/icon-map'
import type { ActionCategory, ActionItem } from '../models/actions-config'
import { BUILT_IN_CATEGORIES } from '../models/actions-config'

interface PromptTemplate {
  id: string
  label: string
  prompt: string
  category: string
}

interface StoreCategory {
  id: string
  label: string
  icon: string
  color: string
}

const MINI_APPS_CATEGORY_ID = 'mini-apps'

const STORE_CATEGORIES: StoreCategory[] = [
  { id: 'productivity', label: 'Productivity', icon: 'zap', color: '#4DC778' },
  { id: 'work', label: 'Work', icon: 'briefcase', color: '#7EB6E0' },
  { id: 'social-media', label: 'Social Media', icon: 'smartphone', color: '#E8A838' },
  { id: 'creative-writing', label: 'Creative Writing', icon: 'pen-tool', color: '#B07CD8' },
  { id: 'education', label: 'Education', icon: 'graduation-cap', color: '#F04545' },
  { id: 'communication', label: 'Communication', icon: 'message-square', color: '#4DC778' },
  { id: 'marketing', label: 'Marketing', icon: 'megaphone', color: '#E8A838' },
  { id: 'personal', label: 'Personal', icon: 'home', color: '#7EB6E0' }
]

const SAMPLE_PROMPTS: PromptTemplate[] = [
  // ── Productivity (13 apps) ──────────────────────────────────────────
  { id: 'p1', label: 'Meeting Summary', prompt: 'Summarize the following meeting notes into key decisions, action items, and next steps:', category: 'productivity' },
  { id: 'p9', label: 'Task Breakdown', prompt: 'Break down this project into actionable tasks with estimated time:', category: 'productivity' },
  { id: 'p13', label: 'Daily Planner', prompt: 'Create a structured daily plan with time blocks based on these tasks and priorities:', category: 'productivity' },
  { id: 'p14', label: 'Goal Tracker', prompt: 'Turn these goals into a SMART goal framework with milestones and deadlines:', category: 'productivity' },
  { id: 'p15', label: 'Habit Builder', prompt: 'Create a 30-day habit-building plan with daily micro-actions for this habit:', category: 'productivity' },
  { id: 'p16', label: 'Priority Matrix', prompt: 'Organize these tasks into an Eisenhower Matrix (urgent/important) and suggest an order of execution:', category: 'productivity' },
  { id: 'p17', label: 'Weekly Review', prompt: 'Generate a weekly review template based on these accomplishments and challenges:', category: 'productivity' },
  { id: 'p18', label: 'Focus Timer Plan', prompt: 'Create a Pomodoro-style focus schedule for this work session with break activities:', category: 'productivity' },
  { id: 'p19', label: 'Decision Matrix', prompt: 'Build a weighted decision matrix to compare these options based on the criteria provided:', category: 'productivity' },
  { id: 'p20', label: 'Delegation Helper', prompt: 'Analyze these tasks and suggest which ones to delegate, automate, or do personally:', category: 'productivity' },
  { id: 'p21', label: 'Mind Map Builder', prompt: 'Create a text-based mind map structure from this central idea, with branches and sub-branches:', category: 'productivity' },
  { id: 'p22', label: 'Process Optimizer', prompt: 'Analyze this workflow and suggest improvements to eliminate bottlenecks and redundancies:', category: 'productivity' },
  { id: 'p23', label: 'OKR Generator', prompt: 'Create Objectives and Key Results (OKRs) based on these high-level goals:', category: 'productivity' },

  // ── Work (13 apps) ─────────────────────────────────────────────────
  { id: 'p2', label: 'Email Draft', prompt: 'Write a professional email based on these bullet points:', category: 'work' },
  { id: 'p10', label: 'Slack Update', prompt: 'Write a concise status update for Slack based on this progress:', category: 'work' },
  { id: 'p24', label: 'Resume Bullet Points', prompt: 'Transform these job responsibilities into impactful resume bullet points using action verbs and metrics:', category: 'work' },
  { id: 'p25', label: 'Cover Letter', prompt: 'Write a tailored cover letter for this job description based on my experience:', category: 'work' },
  { id: 'p26', label: 'Performance Review', prompt: 'Draft a self-assessment for a performance review based on these accomplishments:', category: 'work' },
  { id: 'p27', label: 'Meeting Agenda', prompt: 'Create a structured meeting agenda with time allocations based on these discussion topics:', category: 'work' },
  { id: 'p28', label: 'Project Proposal', prompt: 'Write a concise project proposal with objectives, scope, timeline, and expected outcomes:', category: 'work' },
  { id: 'p29', label: 'Interview Prep', prompt: 'Generate likely interview questions and strong answers based on this job description:', category: 'work' },
  { id: 'p30', label: 'Feedback Generator', prompt: 'Write constructive feedback for a colleague based on these observations. Be specific and actionable:', category: 'work' },
  { id: 'p31', label: 'Report Summary', prompt: 'Summarize this lengthy report into an executive summary with key findings and recommendations:', category: 'work' },
  { id: 'p32', label: 'SOW Draft', prompt: 'Draft a Statement of Work based on these project requirements and deliverables:', category: 'work' },
  { id: 'p33', label: 'Onboarding Guide', prompt: 'Create an onboarding checklist and guide for a new team member joining this role:', category: 'work' },
  { id: 'p34', label: 'Presentation Outline', prompt: 'Create a slide-by-slide presentation outline with talking points for this topic:', category: 'work' },

  // ── Social Media (13 apps) ─────────────────────────────────────────
  { id: 'p3', label: 'Tweet Generator', prompt: 'Create an engaging tweet from this content. Keep it under 280 characters:', category: 'social-media' },
  { id: 'p11', label: 'Instagram Caption', prompt: 'Write an engaging Instagram caption with relevant hashtags for this photo description:', category: 'social-media' },
  { id: 'p35', label: 'LinkedIn Post', prompt: 'Write a professional LinkedIn post with storytelling hooks based on this experience or insight:', category: 'social-media' },
  { id: 'p36', label: 'TikTok Script', prompt: 'Write a short, attention-grabbing TikTok video script (under 60 seconds) for this topic:', category: 'social-media' },
  { id: 'p37', label: 'YouTube Title & Description', prompt: 'Generate an SEO-optimized YouTube title, description, and tags for this video topic:', category: 'social-media' },
  { id: 'p38', label: 'Hashtag Generator', prompt: 'Generate 30 relevant hashtags organized by popularity (high, medium, niche) for this topic:', category: 'social-media' },
  { id: 'p39', label: 'Thread Writer', prompt: 'Turn this long-form content into an engaging Twitter/X thread with a compelling hook:', category: 'social-media' },
  { id: 'p40', label: 'Bio Generator', prompt: 'Write a compelling social media bio (under 150 characters) for this person or brand:', category: 'social-media' },
  { id: 'p41', label: 'Content Calendar', prompt: 'Create a 7-day social media content calendar with post ideas and best posting times for this niche:', category: 'social-media' },
  { id: 'p42', label: 'Viral Hook Writer', prompt: 'Generate 10 scroll-stopping opening hooks for social media posts about this topic:', category: 'social-media' },
  { id: 'p43', label: 'Comment Reply', prompt: 'Write witty, engaging replies to these social media comments that boost engagement:', category: 'social-media' },
  { id: 'p44', label: 'Poll Creator', prompt: 'Create 5 engaging poll questions with options for this topic that will drive engagement:', category: 'social-media' },
  { id: 'p45', label: 'Reel Script', prompt: 'Write a short Instagram Reel script with visual directions and voiceover text for this concept:', category: 'social-media' },

  // ── Creative Writing (13 apps) ─────────────────────────────────────
  { id: 'p4', label: 'Story Starter', prompt: 'Write a creative story opening based on this premise:', category: 'creative-writing' },
  { id: 'p12', label: 'Blog Intro', prompt: 'Write a compelling blog post introduction on this topic:', category: 'creative-writing' },
  { id: 'p46', label: 'Poem Generator', prompt: 'Write a poem in the specified style based on this theme or emotion:', category: 'creative-writing' },
  { id: 'p47', label: 'Character Creator', prompt: 'Create a detailed character profile with backstory, personality traits, and motivations based on this concept:', category: 'creative-writing' },
  { id: 'p48', label: 'Dialogue Writer', prompt: 'Write a natural, engaging dialogue between characters in this scenario:', category: 'creative-writing' },
  { id: 'p49', label: 'Plot Twist Generator', prompt: 'Generate 5 unexpected but satisfying plot twists for this story setup:', category: 'creative-writing' },
  { id: 'p50', label: 'Song Lyrics', prompt: 'Write song lyrics with verses, chorus, and bridge based on this theme and mood:', category: 'creative-writing' },
  { id: 'p51', label: 'World Builder', prompt: 'Create a detailed fictional world setting with history, geography, and culture based on this concept:', category: 'creative-writing' },
  { id: 'p52', label: 'Flash Fiction', prompt: 'Write a complete flash fiction story (under 500 words) based on this prompt:', category: 'creative-writing' },
  { id: 'p53', label: 'Book Blurb', prompt: 'Write a captivating back-cover book blurb that hooks readers based on this story summary:', category: 'creative-writing' },
  { id: 'p54', label: 'Screenplay Scene', prompt: 'Write a screenplay-formatted scene with action lines and dialogue based on this scenario:', category: 'creative-writing' },
  { id: 'p55', label: 'Metaphor Machine', prompt: 'Generate creative metaphors and similes to describe this concept or experience:', category: 'creative-writing' },
  { id: 'p56', label: 'Writing Prompt Generator', prompt: 'Generate 10 unique and inspiring creative writing prompts in this genre:', category: 'creative-writing' },

  // ── Education (12 apps) ────────────────────────────────────────────
  { id: 'p5', label: 'Study Notes', prompt: 'Convert these notes into organized study material with key concepts highlighted:', category: 'education' },
  { id: 'p57', label: 'Flashcard Maker', prompt: 'Create a set of study flashcards (question on front, answer on back) from this material:', category: 'education' },
  { id: 'p58', label: 'Concept Explainer', prompt: 'Explain this complex concept in simple terms, as if teaching it to a beginner. Use analogies:', category: 'education' },
  { id: 'p59', label: 'Quiz Generator', prompt: 'Create a quiz with multiple choice and short answer questions based on this study material:', category: 'education' },
  { id: 'p60', label: 'Essay Outline', prompt: 'Create a detailed essay outline with thesis statement, arguments, and supporting evidence for this topic:', category: 'education' },
  { id: 'p61', label: 'Lesson Plan', prompt: 'Design a lesson plan with objectives, activities, and assessment methods for teaching this topic:', category: 'education' },
  { id: 'p62', label: 'Research Summary', prompt: 'Summarize this research paper or article into key findings, methodology, and implications:', category: 'education' },
  { id: 'p63', label: 'Vocabulary Builder', prompt: 'Create vocabulary cards with definitions, example sentences, and mnemonics for these words:', category: 'education' },
  { id: 'p64', label: 'Debate Prep', prompt: 'Prepare arguments for both sides of this debate topic with evidence and counterarguments:', category: 'education' },
  { id: 'p65', label: 'Math Problem Solver', prompt: 'Solve this math problem step by step, explaining each step clearly for a student:', category: 'education' },
  { id: 'p66', label: 'Book Report Helper', prompt: 'Create a structured book report outline covering summary, themes, characters, and analysis for this book:', category: 'education' },
  { id: 'p67', label: 'Language Tutor', prompt: 'Create a mini language lesson with key phrases, grammar tips, and practice exercises for this topic:', category: 'education' },

  // ── Communication (12 apps) ────────────────────────────────────────
  { id: 'p6', label: 'Apology Message', prompt: 'Write a sincere apology message based on this situation:', category: 'communication' },
  { id: 'p68', label: 'Thank You Note', prompt: 'Write a heartfelt thank you note for this gesture or gift:', category: 'communication' },
  { id: 'p69', label: 'Difficult Conversation', prompt: 'Help me prepare for this difficult conversation. Suggest an approach, key points, and empathetic phrasing:', category: 'communication' },
  { id: 'p70', label: 'Negotiation Script', prompt: 'Prepare a negotiation strategy with talking points and responses to likely objections for this scenario:', category: 'communication' },
  { id: 'p71', label: 'Complaint Letter', prompt: 'Write a firm but professional complaint letter about this issue, requesting a specific resolution:', category: 'communication' },
  { id: 'p72', label: 'Congratulations Message', prompt: 'Write a warm congratulations message for this achievement or milestone:', category: 'communication' },
  { id: 'p73', label: 'Announcement Draft', prompt: 'Write a clear and engaging announcement for this news or event:', category: 'communication' },
  { id: 'p74', label: 'Sympathy Message', prompt: 'Write a compassionate sympathy or condolence message for this situation:', category: 'communication' },
  { id: 'p75', label: 'Invitation Writer', prompt: 'Write an inviting and informative invitation for this event with all key details:', category: 'communication' },
  { id: 'p76', label: 'Icebreaker Generator', prompt: 'Generate 10 fun and appropriate icebreaker questions or activities for this type of group:', category: 'communication' },
  { id: 'p77', label: 'Speech Writer', prompt: 'Write a compelling speech with an opening hook, key points, and memorable closing for this occasion:', category: 'communication' },
  { id: 'p78', label: 'Conflict Resolver', prompt: 'Analyze this conflict situation and suggest a fair resolution approach with communication strategies:', category: 'communication' },

  // ── Marketing (12 apps) ────────────────────────────────────────────
  { id: 'p7', label: 'Product Description', prompt: 'Write a compelling product description from these features:', category: 'marketing' },
  { id: 'p79', label: 'Ad Copy Writer', prompt: 'Write persuasive ad copy for this product/service targeting this audience. Include a headline, body, and CTA:', category: 'marketing' },
  { id: 'p80', label: 'SEO Meta Tags', prompt: 'Generate an SEO-optimized meta title and description for this webpage:', category: 'marketing' },
  { id: 'p81', label: 'Email Campaign', prompt: 'Write a marketing email sequence (3 emails) for this product launch or promotion:', category: 'marketing' },
  { id: 'p82', label: 'Brand Voice Guide', prompt: 'Create a brand voice and tone guide based on these brand values and target audience:', category: 'marketing' },
  { id: 'p83', label: 'Tagline Generator', prompt: 'Generate 10 catchy, memorable taglines or slogans for this brand or product:', category: 'marketing' },
  { id: 'p84', label: 'Landing Page Copy', prompt: 'Write conversion-focused landing page copy with headline, benefits, social proof section, and CTA:', category: 'marketing' },
  { id: 'p85', label: 'Customer Persona', prompt: 'Create a detailed customer persona with demographics, pain points, goals, and buying behavior:', category: 'marketing' },
  { id: 'p86', label: 'A/B Test Ideas', prompt: 'Suggest 5 A/B test ideas with hypotheses for improving conversion on this page or campaign:', category: 'marketing' },
  { id: 'p87', label: 'Press Release', prompt: 'Write a professional press release for this company news or product launch:', category: 'marketing' },
  { id: 'p88', label: 'Testimonial Request', prompt: 'Write a friendly email requesting a testimonial or review from this satisfied customer:', category: 'marketing' },
  { id: 'p89', label: 'Competitor Analysis', prompt: 'Create a competitive analysis framework comparing this product against these competitors on key features:', category: 'marketing' },

  // ── Personal (12 apps) ─────────────────────────────────────────────
  { id: 'p8', label: 'Journal Entry', prompt: 'Turn these thoughts into a reflective journal entry:', category: 'personal' },
  { id: 'p90', label: 'Gratitude List', prompt: 'Help me expand on these things I am grateful for into a meaningful gratitude journal entry:', category: 'personal' },
  { id: 'p91', label: 'Meal Planner', prompt: 'Create a weekly meal plan with recipes based on these dietary preferences and ingredients:', category: 'personal' },
  { id: 'p92', label: 'Workout Planner', prompt: 'Design a workout routine based on these fitness goals, available equipment, and time constraints:', category: 'personal' },
  { id: 'p93', label: 'Travel Itinerary', prompt: 'Create a detailed travel itinerary with activities, restaurants, and tips for this destination and duration:', category: 'personal' },
  { id: 'p94', label: 'Gift Ideas', prompt: 'Suggest thoughtful gift ideas based on this person\'s interests, age, and the occasion:', category: 'personal' },
  { id: 'p95', label: 'Budget Planner', prompt: 'Create a monthly budget plan based on this income and these expenses. Suggest areas to save:', category: 'personal' },
  { id: 'p96', label: 'Morning Routine', prompt: 'Design an optimal morning routine based on these goals and available time:', category: 'personal' },
  { id: 'p97', label: 'Book Recommendations', prompt: 'Recommend 10 books based on these interests and favorite books I have read:', category: 'personal' },
  { id: 'p98', label: 'Self-Care Plan', prompt: 'Create a personalized self-care plan with daily, weekly, and monthly activities based on these needs:', category: 'personal' },
  { id: 'p99', label: 'Life Goals Planner', prompt: 'Help me organize these life goals into short-term, medium-term, and long-term with action steps:', category: 'personal' },
  { id: 'p100', label: 'Recipe Converter', prompt: 'Convert this recipe to serve a different number of people and suggest ingredient substitutions if needed:', category: 'personal' }
]

/**
 * Load the current actions from the store and extract the set of mini-app
 * prompt IDs that have already been added.
 */
async function loadAddedPromptIds(): Promise<Set<string>> {
  const stored = await window.tapwisper.store.get('actions') as ActionCategory[] | undefined
  if (!stored) return new Set()

  const miniApps = stored.find((c) => c.id === MINI_APPS_CATEGORY_ID)
  if (!miniApps) return new Set()

  // Action IDs in the mini-apps category are stored as "miniapp-{promptId}"
  const ids = new Set<string>()
  for (const action of miniApps.actions) {
    if (action.id.startsWith('miniapp-')) {
      ids.add(action.id.replace('miniapp-', ''))
    }
  }
  return ids
}

/**
 * Add a prompt to the actions store under the "Mini Apps" category.
 */
async function addPromptToActions(prompt: PromptTemplate): Promise<void> {
  let categories = await window.tapwisper.store.get('actions') as ActionCategory[] | undefined
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    categories = [...BUILT_IN_CATEGORIES]
  }

  let miniAppsCat = categories.find((c) => c.id === MINI_APPS_CATEGORY_ID)
  if (!miniAppsCat) {
    miniAppsCat = {
      id: MINI_APPS_CATEGORY_ID,
      label: 'Mini Apps',
      icon: 'store',
      color: '#E86B6B',
      isBuiltIn: false,
      isVisible: true,
      order: categories.length,
      actions: []
    }
    categories.push(miniAppsCat)
  }

  const actionId = `miniapp-${prompt.id}`
  if (miniAppsCat.actions.some((a) => a.id === actionId)) return

  const newAction: ActionItem = {
    id: actionId,
    label: prompt.label,
    prompt: prompt.prompt,
    isBuiltIn: false
  }
  miniAppsCat.actions.push(newAction)

  // Persist the updated categories
  await window.tapwisper.store.set('actions', categories)
}

/**
 * Remove a prompt from the actions store.
 */
async function removePromptFromActions(promptId: string): Promise<void> {
  const categories = await window.tapwisper.store.get('actions') as ActionCategory[] | undefined
  if (!categories) return

  const miniAppsCat = categories.find((c) => c.id === MINI_APPS_CATEGORY_ID)
  if (!miniAppsCat) return

  const actionId = `miniapp-${promptId}`
  miniAppsCat.actions = miniAppsCat.actions.filter((a) => a.id !== actionId)

  // If no more mini-app actions, remove the category entirely
  if (miniAppsCat.actions.length === 0) {
    const idx = categories.indexOf(miniAppsCat)
    if (idx !== -1) categories.splice(idx, 1)
  }

  await window.tapwisper.store.set('actions', categories)
}

export function MiniAppStore(): JSX.Element {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [addedPrompts, setAddedPrompts] = useState<Set<string>>(new Set())

  // Load which prompts are already added on mount
  useEffect(() => {
    loadAddedPromptIds().then(setAddedPrompts)
  }, [])

  const filteredPrompts = useMemo(() => {
    let prompts = SAMPLE_PROMPTS
    if (selectedCategory) {
      prompts = prompts.filter((p) => p.category === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      prompts = prompts.filter(
        (p) => p.label.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)
      )
    }
    return prompts
  }, [searchQuery, selectedCategory])

  const handleAddPrompt = useCallback(async (prompt: PromptTemplate) => {
    await addPromptToActions(prompt)
    setAddedPrompts((prev) => new Set([...prev, prompt.id]))
  }, [])

  const handleRemovePrompt = useCallback(async (promptId: string) => {
    await removePromptFromActions(promptId)
    setAddedPrompts((prev) => {
      const next = new Set(prev)
      next.delete(promptId)
      return next
    })
  }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="drag-region mb-6">
        <h1 className="text-2xl font-bold text-theme-text">{t('miniApps.title')}</h1>
        <p className="text-sm text-theme-text-secondary mt-1">
          {t('miniApps.subtitle')}
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-theme-card rounded-xl border border-theme-border/50 mb-6">
        <Search className="w-4 h-4 text-theme-text-muted" />
        <input
          type="text"
          placeholder={t('miniApps.searchPrompts')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-theme-text placeholder-theme-text-muted outline-none"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`action-pill shrink-0 ${
            !selectedCategory
              ? 'bg-sky-accent/20 text-sky-accent'
              : 'bg-theme-card text-theme-text-secondary hover:text-theme-text'
          }`}
        >
          {t('miniApps.all')}
        </button>
        {STORE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`action-pill shrink-0 flex items-center gap-1.5 ${
              selectedCategory === cat.id
                ? ''
                : 'text-theme-text-secondary hover:text-theme-text'
            }`}
            style={{
              backgroundColor:
                selectedCategory === cat.id ? `${cat.color}30` : undefined,
              color: selectedCategory === cat.id ? cat.color : undefined
            }}
          >
            <CategoryIcon name={cat.icon} className="w-3.5 h-3.5" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Prompt Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredPrompts.map((prompt) => {
          const cat = STORE_CATEGORIES.find((c) => c.id === prompt.category)
          const isAdded = addedPrompts.has(prompt.id)

          return (
            <div
              key={prompt.id}
              className="bg-theme-card rounded-xl p-4 border border-theme-border/50 flex flex-col"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-theme-text">{prompt.label}</h3>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${cat?.color}20`,
                    color: cat?.color
                  }}
                >
                  {cat && <CategoryIcon name={cat.icon} className="w-3 h-3" />}
                </span>
              </div>
              <p className="text-xs text-theme-text-tertiary leading-relaxed flex-1 line-clamp-3 mb-3">
                {prompt.prompt}
              </p>
              {isAdded ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-green-accent/10 text-green-accent">
                    <Check className="w-3 h-3" />
                    {t('miniApps.added')}
                  </div>
                  <button
                    onClick={() => handleRemovePrompt(prompt.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    title="Remove from actions"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleAddPrompt(prompt)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20"
                >
                  <Plus className="w-3 h-3" />
                  {t('miniApps.addToToolbar')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {filteredPrompts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-text-muted text-sm">{t('miniApps.noPrompts', 'No prompts found')}</p>
        </div>
      )}
    </div>
  )
}
