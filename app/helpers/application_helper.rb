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
end
