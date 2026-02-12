class Match < ApplicationRecord
  belongs_to :club
  has_many :teams, dependent: :destroy
  has_many :games, dependent: :destroy

  before_create :generate_share_token
  before_validation :normalize_games_per_match
  before_validation :normalize_regular_quarters, if: :supports_regular_quarters_column?

  validates :played_on, presence: true
  validates :teams_count, inclusion: { in: [ 2, 3 ] }
  validates :games_per_match, inclusion: { in: 1..3 }
  validates :regular_quarters, inclusion: { in: [ 3, 4 ] }, if: :supports_regular_quarters_column?

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

  def regular_quarters_count
    return 4 unless supports_regular_quarters_column?

    value = self[:regular_quarters].to_i
    [ 3, 4 ].include?(value) ? value : 4
  end

  def three_quarter_mode?
    regular_quarters_count == 3
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

  def normalize_regular_quarters
    return unless supports_regular_quarters_column?

    value = self[:regular_quarters].to_i
    self.regular_quarters = [ 3, 4 ].include?(value) ? value : 4
  end

  def supports_regular_quarters_column?
    self.class.column_names.include?("regular_quarters")
  end
end
