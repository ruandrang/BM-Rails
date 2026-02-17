class Team < ApplicationRecord
  COLORS = %w[White Black Red Blue Yellow Green Pink SkyBlue Brown Orange].freeze

  belongs_to :match
  has_many :team_members, dependent: :destroy
  has_many :members, through: :team_members
  has_many :home_games, class_name: "Game", foreign_key: :home_team_id, dependent: :destroy
  has_many :away_games, class_name: "Game", foreign_key: :away_team_id, dependent: :destroy

  validates :label, presence: true
  validates :label, uniqueness: { scope: :match_id }
  validates :color, presence: true, inclusion: { in: COLORS }

  def name
    label
  end

  def icon
    case color
    when "Red" then "🔴"
    when "Blue" then "🔵"
    when "Black" then "⚫"
    when "White" then "⚪"
    when "Yellow" then "🟡"
    when "Green" then "🟢"
    when "Pink" then "🩷"
    when "SkyBlue" then "🩵"
    when "Brown" then "🟤"
    when "Orange" then "🟠"
    else "🛡️"
    end
  end

  def css_color
    case color
    when "Red" then "#EF4444"
    when "Blue" then "#3B82F6"
    when "Black" then "#1F2937"
    when "White" then "#F3F4F6"
    when "Yellow" then "#FFFD00"
    when "Green" then "#00FF66"
    when "Pink" then "#EC4899"
    when "SkyBlue" then "#38BDF8"
    when "Brown" then "#92400E"
    when "Orange" then "#FF7100"
    else "#6B7280"
    end
  end

  def css_text_color
    %w[White Yellow SkyBlue Green].include?(color) ? "#1F2937" : "#FFFFFF"
  end
end
