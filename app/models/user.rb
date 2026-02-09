class User < ApplicationRecord
  DEFAULT_GAME_MINUTES = 8
  MIN_GAME_MINUTES = 1
  MAX_GAME_MINUTES = 60

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

  before_validation { self.email = email.to_s.downcase.strip }

  def admin?
    admin
  end

  def default_period_seconds
    default_game_minutes.to_i * 60
  end
end
