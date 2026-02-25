import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const db = {
  async getActivityLog() {
    if (supabase) {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
      if (error) throw error
      return data || []
    }
    return JSON.parse(localStorage.getItem('net_activity_log') || '[]')
  },

  async addActivity(entry) {
    if (supabase) {
      const { data, error } = await supabase
        .from('activity_log')
        .insert(entry)
        .select()
        .single()
      if (error) throw error
      return data
    }
    const log = JSON.parse(localStorage.getItem('net_activity_log') || '[]')
    log.push(entry)
    localStorage.setItem('net_activity_log', JSON.stringify(log))
    return entry
  },

  async clearActivityLog() {
    if (supabase) {
      const { error } = await supabase
        .from('activity_log')
        .delete()
        .neq('id', '')
      if (error) throw error
      return
    }
    localStorage.setItem('net_activity_log', '[]')
  },

  async getContacts() {
    if (supabase) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return JSON.parse(localStorage.getItem('net_contacts') || '[]')
  },

  async upsertContact(contact) {
    if (supabase) {
      const { data, error } = await supabase
        .from('contacts')
        .upsert(contact)
        .select()
        .single()
      if (error) throw error
      return data
    }
    const contacts = JSON.parse(localStorage.getItem('net_contacts') || '[]')
    const idx = contacts.findIndex(c => c.id === contact.id)
    if (idx >= 0) contacts[idx] = contact
    else contacts.push(contact)
    localStorage.setItem('net_contacts', JSON.stringify(contacts))
    return contact
  },

  async deleteContact(id) {
    if (supabase) {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id)
      if (error) throw error
      return
    }
    const contacts = JSON.parse(localStorage.getItem('net_contacts') || '[]')
    localStorage.setItem('net_contacts', JSON.stringify(contacts.filter(c => c.id !== id)))
  },

  async importContacts(contactsList) {
    if (supabase) {
      const { data, error } = await supabase
        .from('contacts')
        .insert(contactsList)
        .select()
      if (error) throw error
      return data
    }
    const existing = JSON.parse(localStorage.getItem('net_contacts') || '[]')
    localStorage.setItem('net_contacts', JSON.stringify([...existing, ...contactsList]))
    return contactsList
  },

  async clearContacts() {
    if (supabase) {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .neq('id', '')
      if (error) throw error
      return
    }
    localStorage.setItem('net_contacts', '[]')
  },

  async getSettings() {
    if (supabase) {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'weekly_goal')
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data?.value ? JSON.parse(data.value) : 25
    }
    return JSON.parse(localStorage.getItem('net_weekly_goal') || '25')
  },

  async setSettings(weeklyGoal) {
    if (supabase) {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'weekly_goal', value: JSON.stringify(weeklyGoal) })
      if (error) throw error
      return
    }
    localStorage.setItem('net_weekly_goal', JSON.stringify(weeklyGoal))
  }
}
