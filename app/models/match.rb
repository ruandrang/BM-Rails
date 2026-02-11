class Match < ApplicationRecord
  belongs_to :club
  has_many :teams, dependent: :destroy
  has_many :games, dependent: :destroy

  before_create :generate_share_token
  before_validation :normalize_games_per_match

  validates :played_on, presence: true
  validates :teams_count, inclusion: { in: [ 2, 3 ] }
  validates :games_per_match, inclusion: { in: 1..3 }

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

  private

  def normalize_games_per_match
    self.games_per_match = games_per_match.to_i
    self.games_per_match = 1 if games_per_match <= 0
    self.games_per_match = 1 if teams_count.to_i == 3
  end

  def generate_share_token
    self.share_token ||= SecureRandom.urlsafe_base64(16)
  end
end
