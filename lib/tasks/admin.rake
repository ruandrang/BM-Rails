namespace :admin do
  desc "Grant admin role to user by email"
  task :grant, [:email] => :environment do |_, args|
    email = args[:email].to_s.strip.downcase
    if email.empty?
      puts "Usage: bin/rails admin:grant[email@example.com]"
      exit 1
    end

    user = User.find_by(email: email)
    unless user
      puts "User not found: #{email}"
      exit 1
    end

    user.update!(admin: true)
    puts "Granted admin to #{email}"
  end
end
