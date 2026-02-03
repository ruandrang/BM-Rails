class User < ApplicationRecord
  has_secure_password

  has_many :clubs, dependent: :destroy

  validates :email, presence: true, uniqueness: true
  validates :password, length: { minimum: 6 }, allow_nil: true
end
