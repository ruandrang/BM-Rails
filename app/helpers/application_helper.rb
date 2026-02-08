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

  def team_record(team, games)
    wins = draws = losses = 0
    games.each do |game|
      next if game.result == "pending"
      if game.result == "draw"
        draws += 1 if [ game.home_team_id, game.away_team_id ].include?(team.id)
      elsif game.result == "home_win"
        wins += 1 if game.home_team_id == team.id
        losses += 1 if game.away_team_id == team.id
      elsif game.result == "away_win"
        wins += 1 if game.away_team_id == team.id
        losses += 1 if game.home_team_id == team.id
      end
    end
    { wins: wins, draws: draws, losses: losses }
  end
end
