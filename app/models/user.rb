class User < ApplicationRecord
  DEFAULT_GAME_MINUTES = 8
  MIN_GAME_MINUTES = 1
  MAX_GAME_MINUTES = 60
  POSSESSION_SWITCH_PATTERNS = {
    "q12_q34" => "1,2쿼터 / 3,4쿼터 공격권 전환",
    "q13_q24" => "1,3쿼터 / 2,4쿼터 공격권 전환"
  }.freeze
  DEFAULT_POSSESSION_SWITCH_PATTERN = "q12_q34"
  VOICE_ANNOUNCEMENT_RATES = [ 1.0, 1.1, 0.9 ].freeze
  DEFAULT_VOICE_ANNOUNCEMENT_RATE = 1.0
  VOICE_ANNOUNCEMENT_RATE_OPTIONS = {
    "보통" => 1.0,
    "빠르게" => 1.1,
    "느리게" => 0.9
  }.freeze

  has_secure_password

  has_many :clubs, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 6 }, on: :create
  validates :password, length: { minimum: 6 }, allow_nil: true, on: :update
  validates :default_game_minutes, numericality: {
    only_integer: true,
    greater_than_or_equal_to: MIN_GAME_MINUTES,
    less_than_or_equal_to: MAX_GAME_MINUTES
  }
  validates :scoreboard_sound_enabled, inclusion: { in: [ true, false ] }
  validates :voice_announcement_enabled, inclusion: { in: [ true, false ] }
  validates :possession_switch_pattern, inclusion: { in: POSSESSION_SWITCH_PATTERNS.keys }
  validates :voice_announcement_rate, inclusion: { in: VOICE_ANNOUNCEMENT_RATES }

  before_validation { self.email = email.to_s.downcase.strip }

  def admin?
    admin
  end

  def default_period_seconds
    default_game_minutes.to_i * 60
  end
end
