module ApplicationHelper
  CLUB_ICON_EMOJI = {
    "basketball" => "🏀",
    "whistle" => "🪈",
    "court" => "🏟️",
    "jersey" => "🎽",
    "shoes" => "👟",
    "hoop" => "🧺",
    "score" => "📊",
    "board" => "📋",
    "trophy" => "🏆",
    "ball_net" => "🥅",
    "ref_hands" => "✋",
    "clipboard" => "🗂️"
  }.freeze

  def club_icon(icon_key)
    CLUB_ICON_EMOJI[icon_key] || "🏀"
  end

  def position_badge_style(position)
    color = Member::POSITION_COLORS[position] || "#6B7280"
    "background-color: #{color}; color: white;"
  end

  def position_display(position)
    Member::POSITION_NAMES[position] || position
  end
end
