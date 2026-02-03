class Member < ApplicationRecord
  POSITIONS = %w[Guard Forward Center].freeze

  belongs_to :club
  has_many :team_members, dependent: :destroy
  has_many :teams, through: :team_members

  validates :name, presence: true
  validates :position, presence: true, inclusion: { in: POSITIONS }
end
