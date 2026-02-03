class Club < ApplicationRecord
  ICONS = %w[
    basketball whistle court jersey shoes hoop score board trophy
    ball_net ref_hands clipboard
  ].freeze

  belongs_to :user
  has_many :members, dependent: :destroy
  has_many :matches, dependent: :destroy

  validates :name, presence: true
  validates :icon, presence: true, inclusion: { in: ICONS }
end
