class Game < ApplicationRecord
  RESULTS = %w[pending home_win away_win draw].freeze

  belongs_to :match
  belongs_to :home_team, class_name: "Team"
  belongs_to :away_team, class_name: "Team"

  validates :result, inclusion: { in: RESULTS }
end
