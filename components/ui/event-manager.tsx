"use client"

import { Fragment, createContext, useContext, useState, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Clock,
  Grid3x3,
  List,
  Search,
  Filter,
  X,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface Event {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  color: string
  category?: string
  attendees?: string[]
  tags?: string[]
  /** Date-only event (no time of day). */
  allDay?: boolean
  /** Read-only events can be opened but not edited, dragged or deleted. */
  editable?: boolean
  /** Optional link shown in the details dialog. */
  href?: string
}

type View = "month" | "week" | "day" | "list"
type EditableField = "description" | "category" | "color" | "tags"
type ColorOption = { name: string; value: string; bg: string; text: string }

export interface EventManagerProps {
  /** Pass `events` to control the list from outside (e.g. a database);
   * mutations then only call the callbacks. Use `defaultEvents` otherwise. */
  events?: Event[]
  defaultEvents?: Event[]
  onEventCreate?: (event: Omit<Event, "id">) => void
  onEventUpdate?: (id: string, event: Partial<Event>) => void
  onEventDelete?: (id: string) => void
  categories?: string[]
  colors?: ColorOption[]
  defaultView?: View
  className?: string
  availableTags?: string[]
  /** New events are date-only by default. */
  defaultAllDay?: boolean
  /** Hide dialog fields your data source can't store. */
  hiddenFields?: EditableField[]
  labels?: {
    newEvent?: string
    searchPlaceholder?: string
    empty?: string
    today?: string
    month?: string
    week?: string
    day?: string
    list?: string
    tags?: string
    categories?: string
  }
  /** BCP 47 locale for month, weekday and date labels. */
  locale?: string
}

/** Locale shared with the month/week/list views. */
const LocaleContext = createContext("en-US")

const defaultColors: ColorOption[] = [
  { name: "Blue", value: "blue", bg: "bg-blue-500", text: "text-blue-700" },
  { name: "Green", value: "green", bg: "bg-green-500", text: "text-green-700" },
  { name: "Purple", value: "purple", bg: "bg-purple-500", text: "text-purple-700" },
  { name: "Orange", value: "orange", bg: "bg-orange-500", text: "text-orange-700" },
  { name: "Pink", value: "pink", bg: "bg-pink-500", text: "text-pink-700" },
  { name: "Red", value: "red", bg: "bg-red-500", text: "text-red-700" },
]

const sameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()

const toInputValue = (date: Date | undefined, allDay: boolean) => {
  if (!date || Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
  return allDay ? local.slice(0, 10) : local.slice(0, 16)
}

const fromInputValue = (value: string, allDay: boolean) =>
  allDay ? new Date(value + "T09:00") : new Date(value)

export function EventManager({
  events: controlledEvents,
  defaultEvents = [],
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  categories = ["Meeting", "Task", "Reminder", "Personal"],
  colors = defaultColors,
  defaultView = "month",
  className,
  availableTags = ["Important", "Urgent", "Work", "Personal", "Team", "Client"],
  defaultAllDay = false,
  hiddenFields = [],
  labels = {},
  locale = "en-US",
}: EventManagerProps) {
  const [localEvents, setLocalEvents] = useState<Event[]>(defaultEvents)
  const controlled = controlledEvents !== undefined
  const events = controlled ? controlledEvents : localEvents
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [view, setView] = useState<View>(defaultView)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [draggedEvent, setDraggedEvent] = useState<Event | null>(null)
  const blankEvent = useCallback(
    (): Partial<Event> => ({
      title: "",
      description: "",
      color: colors[0].value,
      category: categories[0],
      tags: [],
      allDay: defaultAllDay,
    }),
    [colors, categories, defaultAllDay],
  )
  const [newEvent, setNewEvent] = useState<Partial<Event>>(blankEvent)
  const show = (field: EditableField) => !hiddenFields.includes(field)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.category?.toLowerCase().includes(query) ||
          event.tags?.some((tag) => tag.toLowerCase().includes(query))
        if (!matchesSearch) return false
      }
      if (selectedColors.length > 0 && !selectedColors.includes(event.color)) return false
      if (selectedTags.length > 0 && !event.tags?.some((tag) => selectedTags.includes(tag))) return false
      if (selectedCategories.length > 0 && event.category && !selectedCategories.includes(event.category))
        return false
      return true
    })
  }, [events, searchQuery, selectedColors, selectedTags, selectedCategories])

  const hasActiveFilters = selectedColors.length > 0 || selectedTags.length > 0 || selectedCategories.length > 0

  const clearFilters = () => {
    setSelectedColors([])
    setSelectedTags([])
    setSelectedCategories([])
    setSearchQuery("")
  }

  const closeDialog = () => {
    setIsDialogOpen(false)
    setIsCreating(false)
    setSelectedEvent(null)
  }

  const openCreate = (date?: Date) => {
    const start = date ? new Date(date) : undefined
    if (start) start.setHours(9, 0, 0, 0)
    setNewEvent({
      ...blankEvent(),
      startTime: start,
      endTime: start ? new Date(start.getTime() + 3600000) : undefined,
    })
    setIsCreating(true)
    setIsDialogOpen(true)
  }

  const handleCreateEvent = useCallback(() => {
    if (!newEvent.title?.trim() || !newEvent.startTime || !newEvent.endTime) return
    const event: Omit<Event, "id"> = {
      title: newEvent.title.trim(),
      description: newEvent.description,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      color: newEvent.color || colors[0].value,
      category: newEvent.category,
      attendees: newEvent.attendees,
      tags: newEvent.tags || [],
      allDay: newEvent.allDay,
    }
    if (!controlled) setLocalEvents((prev) => [...prev, { ...event, id: crypto.randomUUID() }])
    onEventCreate?.(event)
    setIsDialogOpen(false)
    setIsCreating(false)
    setNewEvent(blankEvent())
  }, [newEvent, colors, controlled, onEventCreate, blankEvent])

  const handleUpdateEvent = useCallback(() => {
    if (!selectedEvent) return
    if (!controlled) setLocalEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? selectedEvent : e)))
    onEventUpdate?.(selectedEvent.id, selectedEvent)
    setIsDialogOpen(false)
    setSelectedEvent(null)
  }, [selectedEvent, controlled, onEventUpdate])

  const handleDeleteEvent = useCallback(
    (id: string) => {
      if (!controlled) setLocalEvents((prev) => prev.filter((e) => e.id !== id))
      onEventDelete?.(id)
      setIsDialogOpen(false)
      setSelectedEvent(null)
    },
    [controlled, onEventDelete],
  )

  const handleDragStart = useCallback((event: Event) => {
    if (event.editable !== false) setDraggedEvent(event)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedEvent(null)
  }, [])

  const handleDrop = useCallback(
    (date: Date, hour?: number) => {
      if (!draggedEvent) return
      const duration = draggedEvent.endTime.getTime() - draggedEvent.startTime.getTime()
      const newStartTime = new Date(date)
      if (hour !== undefined) newStartTime.setHours(hour, 0, 0, 0)
      else newStartTime.setHours(draggedEvent.startTime.getHours(), draggedEvent.startTime.getMinutes(), 0, 0)
      const newEndTime = new Date(newStartTime.getTime() + duration)
      const updatedEvent = { ...draggedEvent, startTime: newStartTime, endTime: newEndTime }
      if (!controlled) setLocalEvents((prev) => prev.map((e) => (e.id === draggedEvent.id ? updatedEvent : e)))
      onEventUpdate?.(draggedEvent.id, updatedEvent)
      setDraggedEvent(null)
    },
    [draggedEvent, controlled, onEventUpdate],
  )

  const navigateDate = useCallback(
    (direction: "prev" | "next") => {
      setCurrentDate((prev) => {
        const newDate = new Date(prev)
        const step = direction === "next" ? 1 : -1
        if (view === "month") newDate.setMonth(prev.getMonth() + step, 1)
        else if (view === "week") newDate.setDate(prev.getDate() + 7 * step)
        else if (view === "day") newDate.setDate(prev.getDate() + step)
        return newDate
      })
    },
    [view],
  )

  const getColorClasses = useCallback(
    (colorValue: string) => colors.find((c) => c.value === colorValue) || colors[0],
    [colors],
  )

  const toggleTag = (tag: string, creating: boolean) => {
    const flip = (tags: string[] = []) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])
    if (creating) setNewEvent((prev) => ({ ...prev, tags: flip(prev.tags) }))
    else setSelectedEvent((prev) => (prev ? { ...prev, tags: flip(prev.tags) } : null))
  }

  const openEvent = (event: Event) => {
    setIsCreating(false)
    setSelectedEvent(event)
    setIsDialogOpen(true)
  }

  const draft = isCreating ? newEvent : selectedEvent
  const readOnly = !isCreating && selectedEvent?.editable === false
  const draftAllDay = !!draft?.allDay
  const patch = (value: Partial<Event>) =>
    isCreating
      ? setNewEvent((prev) => ({ ...prev, ...value }))
      : setSelectedEvent((prev) => (prev ? { ...prev, ...value } : null))

  const filterMenus = (align: "start" | "end", mobile: boolean) => {
    const triggerClass = cn("gap-2 bg-transparent", mobile && "whitespace-nowrap flex-shrink-0")
    const count = (n: number) =>
      n > 0 && (
        <Badge variant="secondary" className={cn("ml-1 h-5", mobile ? "px-1.5" : "px-1")}>
          {n}
        </Badge>
      )
    return (
      <>
        {show("color") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={triggerClass}>
                <Filter className="h-4 w-4" />
                Colors
                {count(selectedColors.length)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-48">
              <DropdownMenuLabel>Filter by Color</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {colors.map((color) => (
                <DropdownMenuCheckboxItem
                  key={color.value}
                  checked={selectedColors.includes(color.value)}
                  onCheckedChange={(checked) =>
                    setSelectedColors((prev) =>
                      checked ? [...prev, color.value] : prev.filter((c) => c !== color.value),
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("h-3 w-3 rounded", color.bg)} />
                    {color.name}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {availableTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={triggerClass}>
                <Filter className="h-4 w-4" />
                {labels.tags || "Tags"}
                {count(selectedTags.length)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-48">
              <DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTags.includes(tag)}
                  onCheckedChange={(checked) =>
                    setSelectedTags((prev) => (checked ? [...prev, tag] : prev.filter((t) => t !== tag)))
                  }
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={triggerClass}>
              <Filter className="h-4 w-4" />
              {labels.categories || "Categories"}
              {count(selectedCategories.length)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="w-48">
            <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {categories.map((category) => (
              <DropdownMenuCheckboxItem
                key={category}
                checked={selectedCategories.includes(category)}
                onCheckedChange={(checked) =>
                  setSelectedCategories((prev) =>
                    checked ? [...prev, category] : prev.filter((c) => c !== category),
                  )
                }
              >
                {category}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className={cn("gap-2", mobile && "whitespace-nowrap flex-shrink-0")}>
            <X className="h-4 w-4" />
            {mobile ? "Clear Filters" : "Clear"}
          </Button>
        )}
      </>
    )
  }

  const viewButtons: { id: View; label: string; Icon: typeof Calendar }[] = [
    { id: "month", label: labels.month || "Month", Icon: Calendar },
    { id: "week", label: labels.week || "Week", Icon: Grid3x3 },
    { id: "day", label: labels.day || "Day", Icon: Clock },
    { id: "list", label: labels.list || "List", Icon: List },
  ]

  return (
    <LocaleContext.Provider value={locale}>
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h2 className="text-xl font-semibold sm:text-2xl">
            {view === "month" && currentDate.toLocaleDateString(locale, { month: "long", year: "numeric" })}
            {view === "week" &&
              startOfWeek(currentDate).toLocaleDateString(locale, { month: "short", day: "numeric" })}
            {view === "day" &&
              currentDate.toLocaleDateString(locale, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            {view === "list" && (labels.list || "All Events")}
          </h2>
          {view !== "list" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateDate("prev")} className="h-8 w-8" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                {labels.today || "Today"}
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigateDate("next")} className="h-8 w-8" aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="sm:hidden">
            <Select value={view} onValueChange={(value) => setView(value as View)}>
              <SelectTrigger className="w-full" aria-label="Calendar view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {viewButtons.map(({ id, label, Icon }) => (
                  <SelectItem key={id} value={id}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden sm:flex items-center gap-1 rounded-lg border bg-background p-1" role="group" aria-label="Calendar view">
            {viewButtons.map(({ id, label, Icon }) => (
              <Button
                key={id}
                variant={view === id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(id)}
                className="h-8"
                aria-pressed={view === id}
              >
                <Icon className="h-4 w-4" />
                <span className="ml-1">{label}</span>
              </Button>
            ))}
          </div>

          <Button onClick={() => openCreate()} className="w-full sm:w-auto" data-em-new="">
            <Plus className="mr-2 h-4 w-4" />
            {labels.newEvent || "New Event"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2" data-em-tools="">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={labels.searchPlaceholder || "Search events..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label={labels.searchPlaceholder || "Search events"}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="sm:hidden -mx-4 px-4">
          <div className="flex gap-2 overflow-x-auto pb-2">{filterMenus("start", true)}</div>
        </div>
        <div className="hidden sm:flex items-center gap-2">{filterMenus("end", false)}</div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {selectedColors.map((colorValue) => {
            const color = getColorClasses(colorValue)
            return (
              <Badge key={colorValue} variant="secondary" className="gap-1">
                <div className={cn("h-2 w-2 rounded-full", color.bg)} />
                {color.name}
                <button
                  onClick={() => setSelectedColors((prev) => prev.filter((c) => c !== colorValue))}
                  className="ml-1 hover:text-foreground"
                  aria-label={`Remove ${color.name} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                className="ml-1 hover:text-foreground"
                aria-label={`Remove ${tag} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedCategories.map((category) => (
            <Badge key={category} variant="secondary" className="gap-1">
              {category}
              <button
                onClick={() => setSelectedCategories((prev) => prev.filter((c) => c !== category))}
                className="ml-1 hover:text-foreground"
                aria-label={`Remove ${category} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {view === "month" && (
        <MonthView
          currentDate={currentDate}
          events={filteredEvents}
          onEventClick={openEvent}
          onDayCreate={openCreate}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          getColorClasses={getColorClasses}
        />
      )}
      {view === "week" && (
        <WeekView
          currentDate={currentDate}
          events={filteredEvents}
          onEventClick={openEvent}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          getColorClasses={getColorClasses}
        />
      )}
      {view === "day" && (
        <DayView
          currentDate={currentDate}
          events={filteredEvents}
          onEventClick={openEvent}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          getColorClasses={getColorClasses}
        />
      )}
      {view === "list" && (
        <ListView
          events={filteredEvents}
          onEventClick={openEvent}
          getColorClasses={getColorClasses}
          empty={labels.empty}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isCreating ? labels.newEvent || "Create Event" : "Event Details"}</DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Add it to your calendar."
                : readOnly
                  ? "This date comes from your saved research and can’t be edited here."
                  : "View and edit details."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="em-title">Title</Label>
              <Input
                id="em-title"
                value={draft?.title || ""}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="What needs doing?"
                maxLength={300}
                disabled={readOnly}
              />
            </div>

            {show("description") && (
              <div className="space-y-2">
                <Label htmlFor="em-description">Description</Label>
                <Textarea
                  id="em-description"
                  value={draft?.description || ""}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Event description"
                  rows={3}
                  disabled={readOnly}
                />
              </div>
            )}

            <div className={cn("grid gap-4", draftAllDay ? "grid-cols-1" : "grid-cols-2")}>
              <div className="space-y-2">
                <Label htmlFor="em-start">{draftAllDay ? "Date" : "Start Time"}</Label>
                <Input
                  id="em-start"
                  type={draftAllDay ? "date" : "datetime-local"}
                  value={toInputValue(draft?.startTime, draftAllDay)}
                  disabled={readOnly}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const start = fromInputValue(e.target.value, draftAllDay)
                    patch(
                      draftAllDay || !draft?.endTime || draft.endTime <= start
                        ? { startTime: start, endTime: new Date(start.getTime() + 3600000) }
                        : { startTime: start },
                    )
                  }}
                />
              </div>
              {!draftAllDay && (
                <div className="space-y-2">
                  <Label htmlFor="em-end">End Time</Label>
                  <Input
                    id="em-end"
                    type="datetime-local"
                    value={toInputValue(draft?.endTime, false)}
                    disabled={readOnly}
                    onChange={(e) => e.target.value && patch({ endTime: new Date(e.target.value) })}
                  />
                </div>
              )}
            </div>

            {(show("category") || show("color")) && (
              <div className="grid grid-cols-2 gap-4">
                {show("category") && (
                  <div className="space-y-2">
                    <Label htmlFor="em-category">Category</Label>
                    <Select value={draft?.category} onValueChange={(value) => patch({ category: value })} disabled={readOnly}>
                      <SelectTrigger id="em-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {show("color") && (
                  <div className="space-y-2">
                    <Label htmlFor="em-color">Color</Label>
                    <Select value={draft?.color} onValueChange={(value) => patch({ color: value })} disabled={readOnly}>
                      <SelectTrigger id="em-color">
                        <SelectValue placeholder="Select color" />
                      </SelectTrigger>
                      <SelectContent>
                        {colors.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div className={cn("h-4 w-4 rounded", color.bg)} />
                              {color.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {show("tags") && availableTags.length > 0 && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => {
                    const isSelected = draft?.tags?.includes(tag)
                    return (
                      <Badge
                        key={tag}
                        asChild
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer transition-all hover:scale-105"
                      >
                        <button type="button" aria-pressed={isSelected} disabled={readOnly} onClick={() => toggleTag(tag, isCreating)}>
                          {tag}
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}

            {!isCreating && selectedEvent?.href && (
              <a
                href={selectedEvent.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Open details <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <DialogFooter>
            {!isCreating && !readOnly && (
              <Button variant="destructive" onClick={() => selectedEvent && handleDeleteEvent(selectedEvent.id)}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={closeDialog}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button
                onClick={isCreating ? handleCreateEvent : handleUpdateEvent}
                disabled={!draft?.title?.trim() || !draft?.startTime}
              >
                {isCreating ? "Create" : "Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </LocaleContext.Provider>
  )
}

function startOfWeek(date: Date) {
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  start.setHours(0, 0, 0, 0)
  return start
}

const formatTime = (date: Date) => date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

function timeLabel(event: Event) {
  if (event.allDay) return "All day"
  return `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
}

function durationLabel(event: Event) {
  if (event.allDay) return ""
  const diff = event.endTime.getTime() - event.startTime.getTime()
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

type CardProps = {
  event: Event
  onEventClick: (event: Event) => void
  onDragStart: (event: Event) => void
  onDragEnd: () => void
  getColorClasses: (color: string) => { bg: string; text: string }
  variant?: "default" | "compact" | "detailed"
}

function EventDetails({ event, colorBg, small }: { event: Event; colorBg: string; small?: boolean }) {
  const duration = durationLabel(event)
  return (
    <Card className={cn("border-2 shadow-xl", small ? "p-3" : "p-4")}>
      <div className={small ? "space-y-2" : "space-y-3"}>
        <div className="flex items-start justify-between gap-2">
          <h4 className={cn("font-semibold leading-tight", small && "text-sm")}>{event.title}</h4>
          <div className={cn("rounded-full flex-shrink-0", small ? "h-3 w-3" : "h-4 w-4", colorBg)} />
        </div>
        {event.description && (
          <p className={cn("text-muted-foreground", small ? "text-xs line-clamp-2" : "text-sm")}>{event.description}</p>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{timeLabel(event)}</span>
          {duration && <span className="text-[10px]">({duration})</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {event.category && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {event.category}
            </Badge>
          )}
          {event.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] h-5">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  )
}

function EventCard({ event, onEventClick, onDragStart, onDragEnd, getColorClasses, variant = "default" }: CardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const colorClasses = getColorClasses(event.color)
  const draggable = event.editable !== false
  const shared = {
    draggable,
    onDragStart: () => onDragStart(event),
    onDragEnd,
    onClick: () => onEventClick(event),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onEventClick(event)
      }
    },
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onFocus: () => setIsHovered(true),
    onBlur: () => setIsHovered(false),
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `${event.title}, ${timeLabel(event)}`,
  }

  if (variant === "detailed") {
    return (
      <div
        {...shared}
        className={cn(
          "cursor-pointer rounded-lg p-3 transition-all duration-300",
          colorClasses.bg,
          "text-white animate-in fade-in slide-in-from-left-2",
          isHovered && "scale-[1.03] shadow-2xl ring-2 ring-white/50",
        )}
      >
        <div className="font-semibold">{event.title}</div>
        {event.description && <div className="mt-1 text-sm opacity-90 line-clamp-2">{event.description}</div>}
        <div className="mt-2 flex items-center gap-2 text-xs opacity-80">
          <Clock className="h-3 w-3" />
          {timeLabel(event)}
        </div>
        {isHovered && (
          <div className="mt-2 flex flex-wrap gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
            {event.category && (
              <Badge variant="secondary" className="text-xs">
                {event.category}
              </Badge>
            )}
            {event.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    )
  }

  const compact = variant === "compact"
  return (
    <div {...shared} className="relative cursor-pointer">
      <div
        data-em-chip=""
        className={cn(
          "flex items-center gap-1.5 truncate rounded-md font-medium transition-colors duration-150",
          compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs",
        )}
      >
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", colorClasses.bg)} />
        <span className="truncate">{event.title}</span>
      </div>
      {isHovered && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-1 animate-in fade-in slide-in-from-top-2 duration-200",
            compact ? "w-64" : "w-72",
          )}
        >
          <EventDetails event={event} colorBg={colorClasses.bg} small={compact} />
        </div>
      )}
    </div>
  )
}

type ViewProps = {
  currentDate: Date
  events: Event[]
  onEventClick: (event: Event) => void
  onDragStart: (event: Event) => void
  onDragEnd: () => void
  getColorClasses: (color: string) => { bg: string; text: string }
}

function MonthView({
  currentDate,
  events,
  onEventClick,
  onDayCreate,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
}: ViewProps & { onDrop: (date: Date) => void; onDayCreate: (date: Date) => void }) {
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const startDate = startOfWeek(firstDayOfMonth)
  const days = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    return day
  })
  const today = new Date()
  const locale = useContext(LocaleContext)

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <div className="grid grid-cols-7 border-b">
        {days.slice(0, 7).map((day) => (
          <div key={day.toISOString()} data-em-dow="" className="border-r p-2 text-center text-xs font-medium last:border-r-0 sm:text-sm">
            <span className="hidden sm:inline">{day.toLocaleDateString(locale, { weekday: "short" })}</span>
            <span className="sm:hidden">{day.toLocaleDateString(locale, { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => sameDay(event.startTime, day))
          const isCurrentMonth = day.getMonth() === currentDate.getMonth()
          const isToday = sameDay(day, today)
          return (
            <div
              key={day.toISOString()}
              data-em-cell={isCurrentMonth ? "" : "out"}
              className={cn(
                "group min-h-20 border-b border-r p-1 transition-colors [&:nth-child(7n)]:border-r-0 sm:min-h-24 sm:p-2",
                !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                "hover:bg-accent/50",
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(day)}
              onDoubleClick={() => onDayCreate(day)}
            >
              <div className="mb-1 flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs sm:h-6 sm:w-6 sm:text-sm",
                    isToday && "bg-primary text-primary-foreground font-semibold",
                  )}
                >
                  {day.getDate()}
                </div>
                <button
                  type="button"
                  onClick={() => onDayCreate(day)}
                  className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 focus:opacity-100 sm:flex"
                  aria-label={`Add on ${day.toDateString()}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEventClick={onEventClick}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    getColorClasses={getColorClasses}
                    variant="compact"
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground sm:text-xs">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function WeekView({
  currentDate,
  events,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
}: ViewProps & { onDrop: (date: Date, hour?: number) => void }) {
  const locale = useContext(LocaleContext)
  const first = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(first)
    day.setDate(first.getDate() + i)
    return day
  })
  const timed = (date: Date, hour: number) =>
    events.filter((e) => !e.allDay && sameDay(e.startTime, date) && e.startTime.getHours() === hour)
  const allDay = (date: Date) => events.filter((e) => e.allDay && sameDay(e.startTime, date))
  const card = (event: Event) => (
    <EventCard
      key={event.id}
      event={event}
      onEventClick={onEventClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      getColorClasses={getColorClasses}
      variant="default"
    />
  )

  return (
    <Card className="overflow-auto gap-0 py-0">
      <div className="grid min-w-[640px] grid-cols-8 border-b">
        <div className="border-r p-2 text-center text-xs font-medium sm:text-sm">Time</div>
        {weekDays.map((day) => (
          <div key={day.toISOString()} className="border-r p-2 text-center text-xs font-medium last:border-r-0 sm:text-sm">
            <div className="hidden sm:block">{day.toLocaleDateString(locale, { weekday: "short" })}</div>
            <div className="sm:hidden">{day.toLocaleDateString(locale, { weekday: "narrow" })}</div>
            <div className="text-[10px] text-muted-foreground sm:text-xs">
              {day.toLocaleDateString(locale, { month: "short", day: "numeric" })}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] grid-cols-8">
        <div className="border-b border-r p-1 text-[10px] text-muted-foreground sm:p-2 sm:text-xs">All day</div>
        {weekDays.map((day) => (
          <div
            key={"all-" + day.toISOString()}
            className="min-h-10 border-b border-r bg-muted/20 p-0.5 last:border-r-0 sm:p-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(day)}
          >
            <div className="space-y-1">{allDay(day).map(card)}</div>
          </div>
        ))}
        {HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className="border-b border-r p-1 text-[10px] text-muted-foreground sm:p-2 sm:text-xs">
              {hour.toString().padStart(2, "0")}:00
            </div>
            {weekDays.map((day) => (
              <div
                key={`${day.toISOString()}-${hour}`}
                className="min-h-12 border-b border-r p-0.5 transition-colors hover:bg-accent/50 last:border-r-0 sm:min-h-16 sm:p-1"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(day, hour)}
              >
                <div className="space-y-1">{timed(day, hour).map(card)}</div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </Card>
  )
}

function DayView({
  currentDate,
  events,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
}: ViewProps & { onDrop: (date: Date, hour?: number) => void }) {
  const allDay = events.filter((e) => e.allDay && sameDay(e.startTime, currentDate))
  const forHour = (hour: number) =>
    events.filter((e) => !e.allDay && sameDay(e.startTime, currentDate) && e.startTime.getHours() === hour)
  const card = (event: Event) => (
    <EventCard
      key={event.id}
      event={event}
      onEventClick={onEventClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      getColorClasses={getColorClasses}
      variant="detailed"
    />
  )

  return (
    <Card className="overflow-auto gap-0 py-0">
      <div className="space-y-0">
        <div
          className="flex border-b bg-muted/20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(currentDate)}
        >
          <div className="w-14 flex-shrink-0 border-r p-2 text-xs text-muted-foreground sm:w-20 sm:p-3 sm:text-sm">All day</div>
          <div className="min-h-12 flex-1 p-1 sm:p-2">
            <div className="space-y-2">{allDay.map(card)}</div>
          </div>
        </div>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="flex border-b last:border-b-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(currentDate, hour)}
          >
            <div className="w-14 flex-shrink-0 border-r p-2 text-xs text-muted-foreground sm:w-20 sm:p-3 sm:text-sm">
              {hour.toString().padStart(2, "0")}:00
            </div>
            <div className="min-h-16 flex-1 p-1 transition-colors hover:bg-accent/50 sm:min-h-20 sm:p-2">
              <div className="space-y-2">{forHour(hour).map(card)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ListView({
  events,
  onEventClick,
  getColorClasses,
  empty,
}: {
  events: Event[]
  onEventClick: (event: Event) => void
  getColorClasses: (color: string) => { bg: string; text: string }
  empty?: string
}) {
  const locale = useContext(LocaleContext)
  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const groups = new Map<string, Event[]>()
  for (const event of sorted) {
    const key = event.startTime.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    groups.set(key, [...(groups.get(key) || []), event])
  }

  return (
    <Card className="gap-0 p-3 sm:p-4">
      {groups.size === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{empty || "No events found"}</div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([date, dayEvents]) => (
            <div key={date} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{date}</h3>
              <div className="space-y-2">
                {dayEvents.map((event) => {
                  const colorClasses = getColorClasses(event.color)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onEventClick(event)}
                      className="group flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md animate-in fade-in slide-in-from-bottom-1 sm:p-4"
                    >
                      <div className={cn("mt-1 h-3 w-3 flex-shrink-0 rounded-full", colorClasses.bg)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                          <h4 className="font-semibold transition-colors group-hover:text-primary">{event.title}</h4>
                          <div className="flex flex-wrap items-center gap-1">
                            {event.category && (
                              <Badge variant="secondary" className="text-xs">
                                {event.category}
                              </Badge>
                            )}
                            {event.tags?.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {event.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                        )}
                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeLabel(event)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
