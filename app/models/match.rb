class Match < ApplicationRecord
  belongs_to :club
  has_many :teams, dependent: :destroy
  has_many :games, dependent: :destroy

  validates :played_on, presence: true
  validates :teams_count, inclusion: { in: [ 2, 3 ] }

  def home_team
    teams.order(:id).first || teams.build(label: "Home", color: Team::COLORS.first)
  end

  def away_team
    teams.order(:id).second || teams.build(label: "Away", color: Team::COLORS.second)
  end

  def match_title
    "Running Game"
  end

  def date
    played_on
  end

  def finished?
    games.any? && games.all? { |g| g.result != "pending" }
  end
end
