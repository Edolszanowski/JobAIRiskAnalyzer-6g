"use client"

import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent, FocusEvent } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Type definitions
interface JobSuggestion {
  occ_code: string
  occ_title: string
  ai_impact_score?: number
}

interface JobSearchInputProps {
  placeholder?: string
  onSelect?: (job: JobSuggestion) => void
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  initialValue?: string
  autoFocus?: boolean
  disabled?: boolean
}

export function JobSearchInput({
  placeholder = "Search for a job title...",
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  initialValue = "",
  autoFocus = false,
  disabled = false,
}: JobSearchInputProps) {
  // State management
  const [inputValue, setInputValue] = useState(initialValue)
  const [suggestions, setSuggestions] = useState<JobSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Fetch suggestions when input changes
  const fetchSuggestions = async (query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      if (query.trim().length === 0) {
        setSuggestions([])
        setIsLoading(false)
        return
      }
      
      setIsLoading(true)
      
      try {
        const response = await fetch(`/api/jobs/suggestions?q=${encodeURIComponent(query)}`)
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.success) {
          setSuggestions(data.suggestions)
          setShowDropdown(true)
        } else {
          setSuggestions([])
        }
      } catch (error) {
        console.error("Error fetching job suggestions:", error)
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }, 300) // 300ms debounce
  }
  
  // Handle input change
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    if (value.trim().length > 0) {
      fetchSuggestions(value)
    } else {
      setSuggestions([])
      setShowDropdown(false)
    }
    
    setSelectedIndex(-1)
  }
  
  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return
    
    // Arrow down - move selection down
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev))
    }
    
    // Arrow up - move selection up
    else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
    }
    
    // Enter - select current suggestion
    else if (e.key === "Enter") {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex])
      }
    }
    
    // Escape - close dropdown
    else if (e.key === "Escape") {
      e.preventDefault()
      setShowDropdown(false)
    }
  }
  
  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: JobSuggestion) => {
    setInputValue(suggestion.occ_title)
    setShowDropdown(false)
    setSuggestions([])
    
    if (onSelect) {
      onSelect(suggestion)
    }
  }
  
  // Handle focus events
  const handleFocus = () => {
    setIsFocused(true)
    if (inputValue.trim().length > 0) {
      fetchSuggestions(inputValue)
      setShowDropdown(true)
    }
  }
  
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    // Delay hiding dropdown to allow for clicks on suggestions
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false)
        setIsFocused(false)
      }
    }, 200)
  }
  
  // Helper for rendering risk badges
  const getRiskBadge = (score?: number) => {
    if (score === undefined) return null
    
    if (score >= 80) {
      return <Badge variant="destructive" className="text-xs">High Risk</Badge>
    } else if (score >= 60) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Medium-High</Badge>
    } else if (score >= 40) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Medium</Badge>
    } else if (score >= 20) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Low-Medium</Badge>
    } else {
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">Low Risk</Badge>
    }
  }
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && 
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])
  
  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const selectedElement = dropdownRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex])
  
  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn("pl-10", inputClassName)}
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
        )}
      </div>
      
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 w-full bg-white mt-1 rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto",
            dropdownClassName
          )}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.occ_code}
              className={cn(
                "px-4 py-2 cursor-pointer hover:bg-gray-100 flex justify-between items-center",
                selectedIndex === index ? "bg-gray-100" : "",
                index !== suggestions.length - 1 ? "border-b border-gray-100" : ""
              )}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex-1">
                <div className="font-medium text-gray-800">{suggestion.occ_title}</div>
                <div className="text-xs text-gray-500">Code: {suggestion.occ_code}</div>
              </div>
              {getRiskBadge(suggestion.ai_impact_score)}
            </div>
          ))}
        </div>
      )}
      
      {showDropdown && suggestions.length === 0 && !isLoading && inputValue.trim().length > 0 && (
        <div className={cn(
          "absolute z-50 w-full bg-white mt-1 rounded-md shadow-lg border border-gray-200 p-4 text-center text-gray-500",
          dropdownClassName
        )}>
          No matching jobs found
        </div>
      )}
    </div>
  )
}
