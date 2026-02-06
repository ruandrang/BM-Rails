class Team < ApplicationRecord
  COLORS = %w[White Black Red Blue Yellow Green].freeze

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
    else "🛡️"
    end
  end
end
