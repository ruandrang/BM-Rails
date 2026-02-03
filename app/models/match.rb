class Match < ApplicationRecord
  belongs_to :club
  has_many :teams, dependent: :destroy
  has_many :games, dependent: :destroy

  validates :played_on, presence: true
  validates :teams_count, inclusion: { in: [2, 3] }
end
